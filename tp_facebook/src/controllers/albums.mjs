import AlbumsModel from '../models/albums.mjs';
import PhotosModel from '../models/photos.mjs';
import CommentsModel from '../models/comments.mjs';
import EventsModel from '../models/events.mjs';
import { isObjectId, validateRequestBody } from '../validation.mjs';
import { handleError, sendBadRequest, sendForbidden, sendNotFound } from '../errors.mjs';
import { canViewEvent, isEventOrganizer } from '../permissions.mjs';

const Albums = class Albums {
    constructor(app){
        this.app = app;
        this.run();
    }

    async findAlbum(req, res) {
        if (!isObjectId(req.params.id)) {
            sendBadRequest(res, 'Invalid album id');
            return {};
        }

        const album = await AlbumsModel.findById(req.params.id);
        const event = album ? await EventsModel.findById(album.event) : null;

        if (!album || !event || !canViewEvent(event, req.auth.sub)) {
            sendNotFound(res, 'Album not found');
            return {};
        }

        return { album, event };
    }

    getAlbumById() {
        this.app.get('/album/:id', async (req, res) => {
            try {
                const { album } = await this.findAlbum(req, res);

                if (!album) {
                    return;
                }

                await album.populate('photos');
                res.status(200).json(album);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    getAlbums() {
        this.app.get('/albums', async (req, res) => {
            try {
                const userId = req.auth.sub;
                const eventFilter = {
                    $or: [
                        { visibility: 'public' },
                        { organizers: userId },
                        { members: userId }
                    ]
                };

                if (req.query.event) {
                    if (!isObjectId(req.query.event)) {
                        return sendBadRequest(res, 'Invalid event id');
                    }
                    eventFilter._id = req.query.event;
                }

                // Seuls les albums des événements visibles par l'utilisateur sont listés
                const eventIds = (await EventsModel.find(eventFilter, '_id')).map(({ _id }) => _id);
                const filter = { event: { $in: eventIds } };

                if (req.query.title) {
                    const escaped = String(req.query.title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    filter.title = { $regex: escaped, $options: 'i' };
                }

                const albums = await AlbumsModel.find(filter).populate('photos');
                res.status(200).json(albums);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    createAlbum() {
        this.app.post('/album', async (req, res) => {
            if (!validateRequestBody(req, res, {
                title: { type: 'string', required: true },
                description: { type: 'string' },
                event: { type: 'objectId', required: true }
            })) {
                return;
            }

            try {
                const { title, description, event: eventId } = req.body;
                const event = await EventsModel.findById(eventId);

                if (!event || !canViewEvent(event, req.auth.sub)) {
                    return sendNotFound(res, 'Event not found');
                }

                if (!isEventOrganizer(event, req.auth.sub)) {
                    return sendForbidden(res, 'Only event organizers can create albums');
                }

                const album = await AlbumsModel.create({ title, description, event: event._id });

                res.status(201).json(album);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    updateAlbumById() {
        this.app.put('/album/:id', async (req, res) => {
            if (!validateRequestBody(req, res, {
                title: { type: 'string', required: true },
                description: { type: 'string' }
            })) {
                return;
            }

            try {
                const { album, event } = await this.findAlbum(req, res);

                if (!album) {
                    return;
                }

                if (!isEventOrganizer(event, req.auth.sub)) {
                    return sendForbidden(res, 'Only event organizers can update albums');
                }

                const { title, description } = req.body;

                album.set({ title, description });
                await album.save();
                await album.populate('photos');

                res.status(200).json(album);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    deleteAlbumById() {
        this.app.delete('/album/:id', async (req, res) => {
            try {
                const { album, event } = await this.findAlbum(req, res);

                if (!album) {
                    return;
                }

                if (!isEventOrganizer(event, req.auth.sub)) {
                    return sendForbidden(res, 'Only event organizers can delete albums');
                }

                await album.deleteOne();

                // Une photo ne peut pas exister sans album : on supprime aussi celles de l'album et leurs commentaires
                await CommentsModel.deleteMany({ photo: { $in: album.photos } });
                await PhotosModel.deleteMany({ album: album._id });

                res.status(200).json(album);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    run() {
        this.getAlbumById();
        this.getAlbums();
        this.createAlbum();
        this.updateAlbumById();
        this.deleteAlbumById();
    }
};

export default Albums;
