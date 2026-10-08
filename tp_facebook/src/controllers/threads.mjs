import ThreadsModel from '../models/threads.mjs';
import MessagesModel from '../models/messages.mjs';
import GroupsModel from '../models/groups.mjs';
import EventsModel from '../models/events.mjs';
import { isObjectId, validateRequestBody } from '../validation.mjs';
import { handleError, sendBadRequest, sendForbidden, sendNotFound } from '../errors.mjs';
import {
    canViewEvent,
    canViewGroup,
    isEventOrganizer,
    isEventParticipant,
    isGroupAdmin,
    isGroupMember
} from '../permissions.mjs';

const Threads = class Threads {
    constructor(app){
        this.app = app;
        this.run();
    }

    // Calcule les droits de l'utilisateur sur un fil, selon le groupe ou l'événement associé
    async getAccess(thread, userId) {
        if (thread.group) {
            const group = await GroupsModel.findById(thread.group);

            if (!group || !canViewGroup(group, userId)) {
                return null;
            }

            const admin = isGroupAdmin(group, userId);
            const member = isGroupMember(group, userId);

            return {
                canRead: member,
                canPost: admin || (member && group.allow_members_to_post),
                isManager: admin
            };
        }

        const event = await EventsModel.findById(thread.event);

        if (!event || !canViewEvent(event, userId)) {
            return null;
        }

        const participant = isEventParticipant(event, userId);

        return {
            canRead: participant,
            canPost: participant,
            isManager: isEventOrganizer(event, userId)
        };
    }

    async findThread(req, res, filter) {
        const thread = await ThreadsModel.findOne(filter);
        const access = thread ? await this.getAccess(thread, req.auth.sub) : null;

        if (!thread || !access) {
            sendNotFound(res, 'Thread not found');
            return {};
        }

        if (!access.canRead) {
            sendForbidden(res, 'You must be a member to access this thread');
            return {};
        }

        return { thread, access };
    }

    getGroupThread() {
        this.app.get('/group/:id/thread', async (req, res) => {
            try {
                if (!isObjectId(req.params.id)) {
                    return sendBadRequest(res, 'Invalid group id');
                }

                const { thread } = await this.findThread(req, res, { group: req.params.id });

                if (thread) {
                    res.status(200).json(thread);
                }
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    getEventThread() {
        this.app.get('/event/:id/thread', async (req, res) => {
            try {
                if (!isObjectId(req.params.id)) {
                    return sendBadRequest(res, 'Invalid event id');
                }

                const { thread } = await this.findThread(req, res, { event: req.params.id });

                if (thread) {
                    res.status(200).json(thread);
                }
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    getMessages() {
        this.app.get('/thread/:idthread/messages', async (req, res) => {
            try {
                if (!isObjectId(req.params.idthread)) {
                    return sendBadRequest(res, 'Invalid thread id');
                }

                const { thread } = await this.findThread(req, res, { _id: req.params.idthread });

                if (!thread) {
                    return;
                }

                const messages = await MessagesModel.find({ thread: thread._id })
                    .sort({ createdAt: 1 })
                    .populate('author', 'firstname lastname');

                res.status(200).json(messages);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    createMessage() {
        this.app.post('/thread/:idthread/message', async (req, res) => {
            if (!validateRequestBody(req, res, {
                content: { type: 'string', required: true, maxLength: 2000 },
                reply_to: { type: 'objectId' }
            })) {
                return;
            }

            try {
                if (!isObjectId(req.params.idthread)) {
                    return sendBadRequest(res, 'Invalid thread id');
                }

                const { thread, access } = await this.findThread(req, res, { _id: req.params.idthread });

                if (!thread) {
                    return;
                }

                if (!access.canPost) {
                    return sendForbidden(res, 'You are not allowed to post in this thread');
                }

                const { content, reply_to: replyTo } = req.body;

                // Une réponse doit viser un message du même fil
                if (replyTo && !(await MessagesModel.exists({ _id: replyTo, thread: thread._id }))) {
                    return sendNotFound(res, 'Message to reply to not found');
                }

                const message = await MessagesModel.create({
                    content,
                    reply_to: replyTo,
                    thread: thread._id,
                    author: req.auth.sub
                });

                res.status(201).json(message);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    deleteMessageById() {
        this.app.delete('/thread/:idthread/message/:idmessage', async (req, res) => {
            try {
                if (!isObjectId(req.params.idthread) || !isObjectId(req.params.idmessage)) {
                    return sendBadRequest(res, 'Invalid id');
                }

                const { thread, access } = await this.findThread(req, res, { _id: req.params.idthread });

                if (!thread) {
                    return;
                }

                const message = await MessagesModel.findOne({
                    _id: req.params.idmessage,
                    thread: thread._id
                });

                if (!message) {
                    return sendNotFound(res, 'Message not found');
                }

                // L'auteur ou un administrateur/organisateur peut supprimer un message
                if (String(message.author) !== req.auth.sub && !access.isManager) {
                    return sendForbidden(res, 'You are not allowed to delete this message');
                }

                await message.deleteOne();

                res.status(200).json(message);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    run() {
        this.getGroupThread();
        this.getEventThread();
        this.getMessages();
        this.createMessage();
        this.deleteMessageById();
    }
};

export default Threads;
