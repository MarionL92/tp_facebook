import CarpoolsModel from '../models/carpools.mjs';
import EventsModel from '../models/events.mjs';
import { isObjectId, validateRequestBody } from '../validation.mjs';
import { handleError, sendBadRequest, sendForbidden, sendNotFound } from '../errors.mjs';
import { canViewEvent, includesUser, isEventOrganizer, isEventParticipant } from '../permissions.mjs';

const carpoolFields = {
    departure_location: { type: 'string', required: true, minLength: 2, maxLength: 255 },
    departure_time: { type: 'date', required: true },
    price: { type: 'number', required: true },
    seats: { type: 'number', required: true },
    max_detour: { type: 'number', required: true }
};

const Carpools = class Carpools {
    constructor(app){
        this.app = app;
        this.run();
    }

    // Le covoiturage n'est accessible qu'aux participants, s'il est activé sur l'événement
    async findEvent(req, res) {
        if (!isObjectId(req.params.idevent)) {
            sendBadRequest(res, 'Invalid event id');
            return null;
        }

        const event = await EventsModel.findById(req.params.idevent);

        if (!event || !canViewEvent(event, req.auth.sub)) {
            sendNotFound(res, 'Event not found');
            return null;
        }

        if (!event.carpooling) {
            sendNotFound(res, 'Carpooling is not enabled for this event');
            return null;
        }

        if (!isEventParticipant(event, req.auth.sub)) {
            sendForbidden(res, 'Only event participants can access carpooling');
            return null;
        }

        return event;
    }

    async findCarpool(req, res) {
        const event = await this.findEvent(req, res);

        if (!event) {
            return {};
        }

        if (!isObjectId(req.params.id)) {
            sendBadRequest(res, 'Invalid carpool id');
            return {};
        }

        const carpool = await CarpoolsModel.findOne({ _id: req.params.id, event: event._id });

        if (!carpool) {
            sendNotFound(res, 'Carpool not found');
            return {};
        }

        return { event, carpool };
    }

    withRemainingSeats(carpool) {
        return {
            ...carpool.toJSON(),
            remaining_seats: carpool.seats - carpool.passengers.length
        };
    }

    getCarpools() {
        this.app.get('/event/:idevent/carpools', async (req, res) => {
            try {
                const event = await this.findEvent(req, res);

                if (!event) {
                    return;
                }

                const carpools = await CarpoolsModel.find({ event: event._id })
                    .sort({ departure_time: 1 })
                    .populate('driver', 'firstname lastname')
                    .populate('passengers', 'firstname lastname');

                res.status(200).json(carpools.map((carpool) => this.withRemainingSeats(carpool)));
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    createCarpool() {
        this.app.post('/event/:idevent/carpool', async (req, res) => {
            if (!validateRequestBody(req, res, carpoolFields)) {
                return;
            }

            try {
                const event = await this.findEvent(req, res);

                if (!event) {
                    return;
                }

                const carpool = await CarpoolsModel.create({
                    ...req.body,
                    event: event._id,
                    driver: req.auth.sub
                });

                res.status(201).json(this.withRemainingSeats(carpool));
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    updateCarpoolById() {
        this.app.put('/event/:idevent/carpool/:id', async (req, res) => {
            if (!validateRequestBody(req, res, carpoolFields)) {
                return;
            }

            try {
                const { carpool } = await this.findCarpool(req, res);

                if (!carpool) {
                    return;
                }

                if (String(carpool.driver) !== req.auth.sub) {
                    return sendForbidden(res, 'Only the driver can update this carpool');
                }

                carpool.set(req.body);
                await carpool.save();

                res.status(200).json(this.withRemainingSeats(carpool));
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    deleteCarpoolById() {
        this.app.delete('/event/:idevent/carpool/:id', async (req, res) => {
            try {
                const { event, carpool } = await this.findCarpool(req, res);

                if (!carpool) {
                    return;
                }

                if (String(carpool.driver) !== req.auth.sub && !isEventOrganizer(event, req.auth.sub)) {
                    return sendForbidden(res, 'You are not allowed to delete this carpool');
                }

                await carpool.deleteOne();

                res.status(200).json(carpool);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    joinCarpool() {
        this.app.post('/event/:idevent/carpool/:id/join', async (req, res) => {
            try {
                const { carpool } = await this.findCarpool(req, res);

                if (!carpool) {
                    return;
                }

                const userId = req.auth.sub;

                if (String(carpool.driver) === userId) {
                    return sendBadRequest(res, 'The driver cannot book a seat in their own carpool');
                }

                if (includesUser(carpool.passengers, userId)) {
                    return res.status(409).json({
                        code: 409,
                        message: 'You already have a seat in this carpool'
                    });
                }

                // Réservation atomique d'une place : le nombre de places est limité
                const updated = await CarpoolsModel.findOneAndUpdate(
                    {
                        _id: carpool._id,
                        passengers: { $ne: userId },
                        $expr: { $lt: [{ $size: '$passengers' }, '$seats'] }
                    },
                    { $push: { passengers: userId } },
                    { new: true }
                );

                if (!updated) {
                    return res.status(409).json({
                        code: 409,
                        message: 'This carpool is full'
                    });
                }

                res.status(200).json(this.withRemainingSeats(updated));
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    leaveCarpool() {
        this.app.post('/event/:idevent/carpool/:id/leave', async (req, res) => {
            try {
                const { carpool } = await this.findCarpool(req, res);

                if (!carpool) {
                    return;
                }

                if (!includesUser(carpool.passengers, req.auth.sub)) {
                    return sendBadRequest(res, 'You do not have a seat in this carpool');
                }

                const updated = await CarpoolsModel.findByIdAndUpdate(
                    carpool._id,
                    { $pull: { passengers: req.auth.sub } },
                    { new: true }
                );

                res.status(200).json(this.withRemainingSeats(updated));
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    run() {
        this.getCarpools();
        this.createCarpool();
        this.updateCarpoolById();
        this.deleteCarpoolById();
        this.joinCarpool();
        this.leaveCarpool();
    }
};

export default Carpools;
