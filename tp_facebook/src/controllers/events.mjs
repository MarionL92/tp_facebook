import EventsModel from '../models/events.mjs';
import GroupsModel from '../models/groups.mjs';
import ThreadsModel from '../models/threads.mjs';
import MessagesModel from '../models/messages.mjs';
import AlbumsModel from '../models/albums.mjs';
import PhotosModel from '../models/photos.mjs';
import CommentsModel from '../models/comments.mjs';
import PollsModel from '../models/polls.mjs';
import PollResponsesModel from '../models/poll_responses.mjs';
import TicketTypesModel from '../models/ticket_types.mjs';
import TicketsModel from '../models/tickets.mjs';
import ShoppingItemsModel from '../models/shopping_items.mjs';
import CarpoolsModel from '../models/carpools.mjs';
import { isObjectId, validateRequestBody } from '../validation.mjs';
import { handleError, sendBadRequest, sendForbidden, sendNotFound } from '../errors.mjs';
import {
    canViewEvent,
    canViewGroup,
    isEventOrganizer,
    isEventParticipant,
    isGroupAdmin,
    isGroupMember,
    uniqueIds
} from '../permissions.mjs';

const eventFields = {
    name: { type: 'string', required: true, minLength: 2, maxLength: 100 },
    description: { type: 'string', maxLength: 2000 },
    start_date: { type: 'date', required: true },
    end_date: { type: 'date', required: true },
    location: { type: 'string', required: true, maxLength: 255 },
    cover_photo: { type: 'string' },
    visibility: { type: 'string', enum: ['public', 'private'] },
    organizers: { type: 'objectIdArray' },
    members: { type: 'objectIdArray' },
    ticketing: { type: 'boolean' },
    shopping_list: { type: 'boolean' },
    carpooling: { type: 'boolean' }
};

const Events = class Events {
    constructor(app){
        this.app = app;
        this.run();
    }

    async findEvent(req, res) {
        if (!isObjectId(req.params.id)) {
            sendBadRequest(res, 'Invalid event id');
            return null;
        }

        const event = await EventsModel.findById(req.params.id);

        // Un événement privé n'est visible que par ses participants
        if (!event || !canViewEvent(event, req.auth.sub)) {
            sendNotFound(res, 'Event not found');
            return null;
        }

        return event;
    }

    getEvents() {
        this.app.get('/events', async (req, res) => {
            try {
                const userId = req.auth.sub;
                const filter = {
                    $or: [
                        { visibility: 'public' },
                        { organizers: userId },
                        { members: userId }
                    ]
                };

                if (req.query.name) {
                    const escaped = String(req.query.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    filter.name = { $regex: escaped, $options: 'i' };
                }

                if (req.query.group) {
                    if (!isObjectId(req.query.group)) {
                        return sendBadRequest(res, 'Invalid group id');
                    }
                    filter.group = req.query.group;
                }

                const events = await EventsModel.find(filter).sort({ start_date: 1 });
                res.status(200).json(events);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    getEventById() {
        this.app.get('/event/:id', async (req, res) => {
            try {
                const event = await this.findEvent(req, res);

                if (!event) {
                    return;
                }

                await event.populate([
                    { path: 'organizers', select: 'firstname lastname email' },
                    { path: 'members', select: 'firstname lastname email' },
                    { path: 'group', select: 'name type' }
                ]);

                res.status(200).json(event);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    createEvent() {
        this.app.post('/event', async (req, res) => {
            if (!validateRequestBody(req, res, {
                ...eventFields,
                group: { type: 'objectId' },
                invite_group_members: { type: 'boolean' }
            })) {
                return;
            }

            try {
                const userId = req.auth.sub;
                const {
                    organizers = [],
                    members = [],
                    group: groupId,
                    invite_group_members: inviteGroupMembers,
                    ...data
                } = req.body;

                let groupMembers = [];

                if (groupId) {
                    const group = await GroupsModel.findById(groupId);

                    if (!group || !canViewGroup(group, userId)) {
                        return sendNotFound(res, 'Group not found');
                    }

                    // Dans un groupe : les administrateurs, ou les membres si le groupe l'autorise
                    const allowed = isGroupAdmin(group, userId) ||
                        (isGroupMember(group, userId) && group.allow_members_to_create_events);

                    if (!allowed) {
                        return sendForbidden(res, 'You are not allowed to create events in this group');
                    }

                    // Invitation de tous les membres du groupe en un clic
                    if (inviteGroupMembers) {
                        groupMembers = uniqueIds(group.admins, group.members);
                    }
                } else if (inviteGroupMembers) {
                    return sendBadRequest(res, 'invite_group_members requires a group');
                }

                // Le créateur de l'événement en devient automatiquement organisateur
                const eventOrganizers = uniqueIds(userId, organizers);
                const event = await EventsModel.create({
                    ...data,
                    group: groupId,
                    organizers: eventOrganizers,
                    members: uniqueIds(members, groupMembers).filter((id) => !eventOrganizers.includes(id))
                });

                // Chaque événement dispose de son fil de discussion
                await ThreadsModel.create({ event: event._id });

                res.status(201).json(event);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    updateEventById() {
        this.app.put('/event/:id', async (req, res) => {
            if (!validateRequestBody(req, res, eventFields)) {
                return;
            }

            try {
                const event = await this.findEvent(req, res);

                if (!event) {
                    return;
                }

                if (!isEventOrganizer(event, req.auth.sub)) {
                    return sendForbidden(res, 'Only event organizers can update this event');
                }

                const { organizers, members, ...data } = req.body;

                event.set(data);

                if (organizers !== undefined) {
                    event.organizers = uniqueIds(organizers);
                }

                if (members !== undefined) {
                    event.members = uniqueIds(members);
                }

                event.members = event.members.filter(
                    (id) => !uniqueIds(event.organizers).includes(String(id))
                );

                await event.save();

                res.status(200).json(event);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    deleteEventById() {
        this.app.delete('/event/:id', async (req, res) => {
            try {
                const event = await this.findEvent(req, res);

                if (!event) {
                    return;
                }

                if (!isEventOrganizer(event, req.auth.sub)) {
                    return sendForbidden(res, 'Only event organizers can delete this event');
                }

                await event.deleteOne();

                // Toutes les données rattachées à l'événement sont supprimées avec lui
                const thread = await ThreadsModel.findOneAndDelete({ event: event._id });
                if (thread) {
                    await MessagesModel.deleteMany({ thread: thread._id });
                }

                const albumIds = (await AlbumsModel.find({ event: event._id }, '_id')).map(({ _id }) => _id);
                const photoIds = (await PhotosModel.find({ album: { $in: albumIds } }, '_id')).map(({ _id }) => _id);
                await CommentsModel.deleteMany({ photo: { $in: photoIds } });
                await PhotosModel.deleteMany({ _id: { $in: photoIds } });
                await AlbumsModel.deleteMany({ _id: { $in: albumIds } });

                const pollIds = (await PollsModel.find({ event: event._id }, '_id')).map(({ _id }) => _id);
                await PollResponsesModel.deleteMany({ poll: { $in: pollIds } });
                await PollsModel.deleteMany({ _id: { $in: pollIds } });

                await TicketsModel.deleteMany({ event: event._id });
                await TicketTypesModel.deleteMany({ event: event._id });
                await ShoppingItemsModel.deleteMany({ event: event._id });
                await CarpoolsModel.deleteMany({ event: event._id });

                res.status(200).json(event);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    joinEvent() {
        this.app.post('/event/:id/join', async (req, res) => {
            try {
                const event = await this.findEvent(req, res);

                if (!event) {
                    return;
                }

                if (event.visibility !== 'public') {
                    return sendForbidden(res, 'Only public events can be joined freely');
                }

                if (!isEventParticipant(event, req.auth.sub)) {
                    event.members.push(req.auth.sub);
                    await event.save();
                }

                res.status(200).json(event);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    leaveEvent() {
        this.app.post('/event/:id/leave', async (req, res) => {
            try {
                const event = await this.findEvent(req, res);

                if (!event) {
                    return;
                }

                const userId = req.auth.sub;

                if (!isEventParticipant(event, userId)) {
                    return sendBadRequest(res, 'You are not a participant of this event');
                }

                if (isEventOrganizer(event, userId) && event.organizers.length === 1) {
                    return sendBadRequest(res, 'The last organizer cannot leave the event');
                }

                event.organizers = event.organizers.filter((id) => String(id) !== userId);
                event.members = event.members.filter((id) => String(id) !== userId);
                await event.save();

                res.status(200).json(event);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    run() {
        this.getEvents();
        this.getEventById();
        this.createEvent();
        this.updateEventById();
        this.deleteEventById();
        this.joinEvent();
        this.leaveEvent();
    }
};

export default Events;
