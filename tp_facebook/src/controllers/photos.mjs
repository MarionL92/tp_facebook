import AlbumsModel from '../models/albums.mjs';
import PhotosModel from '../models/photos.mjs';
import CommentsModel from '../models/comments.mjs';
import EventsModel from '../models/events.mjs';
import { isObjectId, validateRequestBody } from '../validation.mjs';
import { handleError, sendBadRequest, sendForbidden, sendNotFound } from '../errors.mjs';
import { canViewEvent, isEventOrganizer, isEventParticipant } from '../permissions.mjs';

const Photos = class Photos {
    constructor(app){
        this.app = app;
        this.run();
    }

    albumNotFound(res) {
        return sendNotFound(res, 'Album not found');
    }

    photoNotFound(res) {
        return sendNotFound(res, 'Photo not found');
    }

    async findAlbum(req, res) {
        if (!isObjectId(req.params.idalbum)) {
            sendBadRequest(res, 'Invalid album id');
            return {};
        }

        const album = await AlbumsModel.findById(req.params.idalbum);
        const event = album ? await EventsModel.findById(album.event) : null;

        if (!album || !event || !canViewEvent(event, req.auth.sub)) {
            this.albumNotFound(res);
            return {};
        }

        return { album, event };
    }

    async findPhoto(req, res) {
        const { album, event } = await this.findAlbum(req, res);

        if (!album) {
            return {};
        }

        if (!isObjectId(req.params.idphoto)) {
            sendBadRequest(res, 'Invalid photo id');
            return {};
        }

        const photo = await PhotosModel.findOne({
            _id: req.params.idphoto,
            album: album._id
        });

        if (!photo) {
            this.photoNotFound(res);
            return {};
        }

        return { album, event, photo };
    }

    getPhotos() {
        this.app.get('/album/:idalbum/photos', async (req, res) => {
            try {
                const { album } = await this.findAlbum(req, res);

                if (!album) {
                    return;
                }

                const photos = await PhotosModel.find({ album: album._id })
                    .populate('author', 'firstname lastname');

                res.status(200).json(photos);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    getPhotoById() {
        this.app.get('/album/:idalbum/photo/:idphoto', async (req, res) => {
            try {
                const { photo } = await this.findPhoto(req, res);

                if (!photo) {
                    return;
                }

                await photo.populate([
                    { path: 'album', select: 'title event' },
                    { path: 'author', select: 'firstname lastname' }
                ]);

                res.status(200).json(photo);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    createPhoto() {
        this.app.post('/album/:idalbum/photo', async (req, res) => {
            if (!validateRequestBody(req, res, {
                title: { type: 'string', required: true },
                url: { type: 'string', required: true },
                description: { type: 'string' }
            })) {
                return;
            }

            try {
                const { album, event } = await this.findAlbum(req, res);

                if (!album) {
                    return;
                }

                // Les photos sont postées par les participants de l'événement
                if (!isEventParticipant(event, req.auth.sub)) {
                    return sendForbidden(res, 'Only event participants can post photos');
                }

                const { title, url, description } = req.body;
                const photo = await PhotosModel.create({
                    title,
                    url,
                    description,
                    album: album._id,
                    author: req.auth.sub
                });

                album.photos.push(photo._id);
                await album.save();

                res.status(201).json(photo);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    updatePhotoById() {
        this.app.put('/album/:idalbum/photo/:idphoto', async (req, res) => {
            if (!validateRequestBody(req, res, {
                title: { type: 'string', required: true },
                url: { type: 'string', required: true },
                description: { type: 'string' }
            })) {
                return;
            }

            try {
                const { photo } = await this.findPhoto(req, res);

                if (!photo) {
                    return;
                }

                if (String(photo.author) !== req.auth.sub) {
                    return sendForbidden(res, 'Only the author can update this photo');
                }

                const { title, url, description } = req.body;

                photo.set({ title, url, description });
                await photo.save();

                res.status(200).json(photo);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    deletePhotoById() {
        this.app.delete('/album/:idalbum/photo/:idphoto', async (req, res) => {
            try {
                const { album, event, photo } = await this.findPhoto(req, res);

                if (!photo) {
                    return;
                }

                if (String(photo.author) !== req.auth.sub && !isEventOrganizer(event, req.auth.sub)) {
                    return sendForbidden(res, 'You are not allowed to delete this photo');
                }

                await photo.deleteOne();
                await CommentsModel.deleteMany({ photo: photo._id });
                await AlbumsModel.updateOne(
                    { _id: album._id },
                    { $pull: { photos: photo._id } }
                );

                res.status(200).json(photo);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    getComments() {
        this.app.get('/album/:idalbum/photo/:idphoto/comments', async (req, res) => {
            try {
                const { photo } = await this.findPhoto(req, res);

                if (!photo) {
                    return;
                }

                const comments = await CommentsModel.find({ photo: photo._id })
                    .sort({ createdAt: 1 })
                    .populate('author', 'firstname lastname');

                res.status(200).json(comments);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    createComment() {
        this.app.post('/album/:idalbum/photo/:idphoto/comment', async (req, res) => {
            if (!validateRequestBody(req, res, {
                content: { type: 'string', required: true, maxLength: 1000 }
            })) {
                return;
            }

            try {
                const { event, photo } = await this.findPhoto(req, res);

                if (!photo) {
                    return;
                }

                // Les photos sont commentées par les participants de l'événement
                if (!isEventParticipant(event, req.auth.sub)) {
                    return sendForbidden(res, 'Only event participants can comment photos');
                }

                const comment = await CommentsModel.create({
                    content: req.body.content,
                    photo: photo._id,
                    author: req.auth.sub
                });

                res.status(201).json(comment);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    deleteCommentById() {
        this.app.delete('/album/:idalbum/photo/:idphoto/comment/:idcomment', async (req, res) => {
            try {
                const { event, photo } = await this.findPhoto(req, res);

                if (!photo) {
                    return;
                }

                if (!isObjectId(req.params.idcomment)) {
                    return sendBadRequest(res, 'Invalid comment id');
                }

                const comment = await CommentsModel.findOne({
                    _id: req.params.idcomment,
                    photo: photo._id
                });

                if (!comment) {
                    return sendNotFound(res, 'Comment not found');
                }

                if (String(comment.author) !== req.auth.sub && !isEventOrganizer(event, req.auth.sub)) {
                    return sendForbidden(res, 'You are not allowed to delete this comment');
                }

                await comment.deleteOne();

                res.status(200).json(comment);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    run() {
        this.getPhotos();
        this.getPhotoById();
        this.createPhoto();
        this.updatePhotoById();
        this.deletePhotoById();
        this.getComments();
        this.createComment();
        this.deleteCommentById();
    }
};

export default Photos;
