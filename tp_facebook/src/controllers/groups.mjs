import GroupsModel from '../models/groups.mjs';
import EventsModel from '../models/events.mjs';
import ThreadsModel from '../models/threads.mjs';
import MessagesModel from '../models/messages.mjs';
import { isObjectId, validateRequestBody } from '../validation.mjs';
import { handleError, sendBadRequest, sendForbidden, sendNotFound } from '../errors.mjs';
import { canViewGroup, isGroupAdmin, isGroupMember, uniqueIds } from '../permissions.mjs';

const groupFields = {
    name: { type: 'string', required: true, minLength: 2, maxLength: 100 },
    description: { type: 'string', maxLength: 2000 },
    icon: { type: 'string' },
    cover_photo: { type: 'string' },
    type: { type: 'string', enum: ['public', 'private', 'secret'] },
    allow_members_to_post: { type: 'boolean' },
    allow_members_to_create_events: { type: 'boolean' },
    admins: { type: 'objectIdArray' },
    members: { type: 'objectIdArray' }
};

const Groups = class Groups {
    constructor(app){
        this.app = app;
        this.run();
    }

    async findGroup(req, res) {
        if (!isObjectId(req.params.id)) {
            sendBadRequest(res, 'Invalid group id');
            return null;
        }

        const group = await GroupsModel.findById(req.params.id);

        // Un groupe secret n'est visible que par ses membres
        if (!group || !canViewGroup(group, req.auth.sub)) {
            sendNotFound(res, 'Group not found');
            return null;
        }

        return group;
    }

    getGroups() {
        this.app.get('/groups', async (req, res) => {
            try {
                const userId = req.auth.sub;
                const filter = {
                    $or: [
                        { type: { $in: ['public', 'private'] } },
                        { admins: userId },
                        { members: userId }
                    ]
                };

                if (req.query.name) {
                    const escaped = String(req.query.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    filter.name = { $regex: escaped, $options: 'i' };
                }

                const groups = await GroupsModel.find(filter);
                res.status(200).json(groups);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    getGroupById() {
        this.app.get('/group/:id', async (req, res) => {
            try {
                const group = await this.findGroup(req, res);

                if (!group) {
                    return;
                }

                await group.populate([
                    { path: 'admins', select: 'firstname lastname email' },
                    { path: 'members', select: 'firstname lastname email' }
                ]);

                res.status(200).json(group);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    createGroup() {
        this.app.post('/group', async (req, res) => {
            if (!validateRequestBody(req, res, groupFields)) {
                return;
            }

            try {
                const userId = req.auth.sub;
                const { admins = [], members = [], ...data } = req.body;

                // Le créateur du groupe en devient automatiquement administrateur
                const groupAdmins = uniqueIds(userId, admins);
                const group = await GroupsModel.create({
                    ...data,
                    admins: groupAdmins,
                    members: uniqueIds(members).filter((id) => !groupAdmins.includes(id))
                });

                // Chaque groupe dispose de son fil de discussion
                await ThreadsModel.create({ group: group._id });

                res.status(201).json(group);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    updateGroupById() {
        this.app.put('/group/:id', async (req, res) => {
            if (!validateRequestBody(req, res, groupFields)) {
                return;
            }

            try {
                const group = await this.findGroup(req, res);

                if (!group) {
                    return;
                }

                if (!isGroupAdmin(group, req.auth.sub)) {
                    return sendForbidden(res, 'Only group administrators can update this group');
                }

                const { admins, members, ...data } = req.body;

                group.set(data);

                if (admins !== undefined) {
                    group.admins = uniqueIds(admins);
                }

                if (members !== undefined) {
                    group.members = uniqueIds(members);
                }

                group.members = group.members.filter(
                    (id) => !uniqueIds(group.admins).includes(String(id))
                );

                await group.save();

                res.status(200).json(group);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    deleteGroupById() {
        this.app.delete('/group/:id', async (req, res) => {
            try {
                const group = await this.findGroup(req, res);

                if (!group) {
                    return;
                }

                if (!isGroupAdmin(group, req.auth.sub)) {
                    return sendForbidden(res, 'Only group administrators can delete this group');
                }

                await group.deleteOne();

                // Le fil de discussion du groupe disparaît avec lui, les événements restent
                const thread = await ThreadsModel.findOneAndDelete({ group: group._id });
                if (thread) {
                    await MessagesModel.deleteMany({ thread: thread._id });
                }
                await EventsModel.updateMany({ group: group._id }, { $unset: { group: '' } });

                res.status(200).json(group);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    joinGroup() {
        this.app.post('/group/:id/join', async (req, res) => {
            try {
                const group = await this.findGroup(req, res);

                if (!group) {
                    return;
                }

                if (group.type !== 'public') {
                    return sendForbidden(res, 'Only public groups can be joined freely');
                }

                if (!isGroupMember(group, req.auth.sub)) {
                    group.members.push(req.auth.sub);
                    await group.save();
                }

                res.status(200).json(group);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    leaveGroup() {
        this.app.post('/group/:id/leave', async (req, res) => {
            try {
                const group = await this.findGroup(req, res);

                if (!group) {
                    return;
                }

                const userId = req.auth.sub;

                if (!isGroupMember(group, userId)) {
                    return sendBadRequest(res, 'You are not a member of this group');
                }

                if (isGroupAdmin(group, userId) && group.admins.length === 1) {
                    return sendBadRequest(res, 'The last administrator cannot leave the group');
                }

                group.admins = group.admins.filter((id) => String(id) !== userId);
                group.members = group.members.filter((id) => String(id) !== userId);
                await group.save();

                res.status(200).json(group);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    run() {
        this.getGroups();
        this.getGroupById();
        this.createGroup();
        this.updateGroupById();
        this.deleteGroupById();
        this.joinGroup();
        this.leaveGroup();
    }
};

export default Groups;
