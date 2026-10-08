import ShoppingItemsModel from '../models/shopping_items.mjs';
import EventsModel from '../models/events.mjs';
import { isObjectId, validateRequestBody } from '../validation.mjs';
import { handleError, sendBadRequest, sendForbidden, sendNotFound } from '../errors.mjs';
import { canViewEvent, isEventOrganizer, isEventParticipant } from '../permissions.mjs';

const itemFields = {
    name: { type: 'string', required: true, minLength: 2, maxLength: 100 },
    quantity: { type: 'number', required: true },
    arrival_time: { type: 'date', required: true }
};

const ShoppingItems = class ShoppingItems {
    constructor(app){
        this.app = app;
        this.run();
    }

    // La shopping list n'est accessible qu'aux participants, si elle est activée sur l'événement
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

        if (!event.shopping_list) {
            sendNotFound(res, 'Shopping list is not enabled for this event');
            return null;
        }

        if (!isEventParticipant(event, req.auth.sub)) {
            sendForbidden(res, 'Only event participants can access the shopping list');
            return null;
        }

        return event;
    }

    async findItem(req, res) {
        const event = await this.findEvent(req, res);

        if (!event) {
            return {};
        }

        if (!isObjectId(req.params.id)) {
            sendBadRequest(res, 'Invalid shopping item id');
            return {};
        }

        const item = await ShoppingItemsModel.findOne({ _id: req.params.id, event: event._id });

        if (!item) {
            sendNotFound(res, 'Shopping item not found');
            return {};
        }

        return { event, item };
    }

    handleDuplicate(err, res) {
        if (err?.code === 11000) {
            return res.status(409).json({
                code: 409,
                message: 'This item is already on the shopping list of this event'
            });
        }

        return handleError(err, res);
    }

    getItems() {
        this.app.get('/event/:idevent/shopping-items', async (req, res) => {
            try {
                const event = await this.findEvent(req, res);

                if (!event) {
                    return;
                }

                const items = await ShoppingItemsModel.find({ event: event._id })
                    .sort({ arrival_time: 1 })
                    .populate('user', 'firstname lastname');

                res.status(200).json(items);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    createItem() {
        this.app.post('/event/:idevent/shopping-item', async (req, res) => {
            if (!validateRequestBody(req, res, itemFields)) {
                return;
            }

            try {
                const event = await this.findEvent(req, res);

                if (!event) {
                    return;
                }

                const { name, quantity, arrival_time: arrivalTime } = req.body;
                const item = await ShoppingItemsModel.create({
                    name,
                    quantity,
                    arrival_time: arrivalTime,
                    event: event._id,
                    user: req.auth.sub
                });

                res.status(201).json(item);
            } catch (err) {
                this.handleDuplicate(err, res);
            }
        });
    }

    updateItemById() {
        this.app.put('/event/:idevent/shopping-item/:id', async (req, res) => {
            if (!validateRequestBody(req, res, itemFields)) {
                return;
            }

            try {
                const { item } = await this.findItem(req, res);

                if (!item) {
                    return;
                }

                if (String(item.user) !== req.auth.sub) {
                    return sendForbidden(res, 'Only the user who added this item can update it');
                }

                const { name, quantity, arrival_time: arrivalTime } = req.body;

                item.set({ name, quantity, arrival_time: arrivalTime });
                await item.save();

                res.status(200).json(item);
            } catch (err) {
                this.handleDuplicate(err, res);
            }
        });
    }

    deleteItemById() {
        this.app.delete('/event/:idevent/shopping-item/:id', async (req, res) => {
            try {
                const { event, item } = await this.findItem(req, res);

                if (!item) {
                    return;
                }

                if (String(item.user) !== req.auth.sub && !isEventOrganizer(event, req.auth.sub)) {
                    return sendForbidden(res, 'You are not allowed to delete this item');
                }

                await item.deleteOne();

                res.status(200).json(item);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    run() {
        this.getItems();
        this.createItem();
        this.updateItemById();
        this.deleteItemById();
    }
};

export default ShoppingItems;
