import TicketTypesModel from '../models/ticket_types.mjs';
import TicketsModel from '../models/tickets.mjs';
import EventsModel from '../models/events.mjs';
import { isObjectId, validateRequestBody } from '../validation.mjs';
import { handleError, sendBadRequest, sendForbidden, sendNotFound } from '../errors.mjs';
import { isEventOrganizer } from '../permissions.mjs';

const ticketTypeFields = {
    name: { type: 'string', required: true, minLength: 2, maxLength: 100 },
    amount: { type: 'number', required: true },
    quantity: { type: 'number', required: true }
};

const Tickets = class Tickets {
    constructor(app, authToken){
        this.app = app;
        this.authToken = authToken;
        this.run();
    }

    // La billetterie n'existe que pour les événements publics qui l'ont activée
    async findTicketingEvent(req, res) {
        if (!isObjectId(req.params.idevent)) {
            sendBadRequest(res, 'Invalid event id');
            return null;
        }

        const event = await EventsModel.findById(req.params.idevent);

        if (!event || event.visibility !== 'public' || !event.ticketing) {
            sendNotFound(res, 'Ticketing not found for this event');
            return null;
        }

        return event;
    }

    async findOrganizerEvent(req, res) {
        const event = await this.findTicketingEvent(req, res);

        if (event && !isEventOrganizer(event, req.auth.sub)) {
            sendForbidden(res, 'Only event organizers can manage the ticketing');
            return null;
        }

        return event;
    }

    getTicketTypes() {
        this.app.get('/event/:idevent/ticket-types', async (req, res) => {
            try {
                const event = await this.findTicketingEvent(req, res);

                if (!event) {
                    return;
                }

                const ticketTypes = await TicketTypesModel.find({ event: event._id });

                res.status(200).json(ticketTypes.map((ticketType) => ({
                    ...ticketType.toJSON(),
                    remaining: ticketType.quantity - ticketType.sold
                })));
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    createTicketType() {
        this.app.post('/event/:idevent/ticket-type', this.authToken, async (req, res) => {
            if (!validateRequestBody(req, res, ticketTypeFields)) {
                return;
            }

            try {
                const event = await this.findOrganizerEvent(req, res);

                if (!event) {
                    return;
                }

                const { name, amount, quantity } = req.body;
                const ticketType = await TicketTypesModel.create({
                    name,
                    amount,
                    quantity,
                    event: event._id
                });

                res.status(201).json(ticketType);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    updateTicketTypeById() {
        this.app.put('/event/:idevent/ticket-type/:id', this.authToken, async (req, res) => {
            if (!validateRequestBody(req, res, ticketTypeFields)) {
                return;
            }

            try {
                const event = await this.findOrganizerEvent(req, res);

                if (!event) {
                    return;
                }

                if (!isObjectId(req.params.id)) {
                    return sendBadRequest(res, 'Invalid ticket type id');
                }

                const ticketType = await TicketTypesModel.findOne({ _id: req.params.id, event: event._id });

                if (!ticketType) {
                    return sendNotFound(res, 'Ticket type not found');
                }

                const { name, amount, quantity } = req.body;

                if (quantity < ticketType.sold) {
                    return sendBadRequest(res, 'Validation failed', [{
                        field: 'quantity',
                        message: `Must be at least ${ticketType.sold} (tickets already sold)`
                    }]);
                }

                ticketType.set({ name, amount, quantity });
                await ticketType.save();

                res.status(200).json(ticketType);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    deleteTicketTypeById() {
        this.app.delete('/event/:idevent/ticket-type/:id', this.authToken, async (req, res) => {
            try {
                const event = await this.findOrganizerEvent(req, res);

                if (!event) {
                    return;
                }

                if (!isObjectId(req.params.id)) {
                    return sendBadRequest(res, 'Invalid ticket type id');
                }

                const ticketType = await TicketTypesModel.findOne({ _id: req.params.id, event: event._id });

                if (!ticketType) {
                    return sendNotFound(res, 'Ticket type not found');
                }

                if (ticketType.sold > 0) {
                    return res.status(409).json({
                        code: 409,
                        message: 'A ticket type with sold tickets cannot be deleted'
                    });
                }

                await ticketType.deleteOne();

                res.status(200).json(ticketType);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    // Achat d'un billet par une personne extérieure : route publique, sans compte
    buyTicket() {
        this.app.post('/event/:idevent/ticket', async (req, res) => {
            if (!validateRequestBody(req, res, {
                ticket_type: { type: 'objectId', required: true },
                firstname: { type: 'string', required: true, minLength: 2, maxLength: 50 },
                lastname: { type: 'string', required: true, minLength: 2, maxLength: 50 },
                email: { type: 'string', required: true, maxLength: 254 },
                address: { type: 'object', required: true }
            })) {
                return;
            }

            try {
                const event = await this.findTicketingEvent(req, res);

                if (!event) {
                    return;
                }

                const { ticket_type: ticketTypeId, firstname, lastname, email, address } = req.body;
                const ticket = new TicketsModel({
                    ticket_type: ticketTypeId,
                    event: event._id,
                    firstname,
                    lastname,
                    email,
                    address: {
                        street: address.street,
                        zip_code: address.zip_code,
                        city: address.city,
                        country: address.country
                    }
                });

                await ticket.validate();

                if (await TicketsModel.exists({ event: event._id, email: ticket.email })) {
                    return res.status(409).json({
                        code: 409,
                        message: 'This person already has a ticket for this event'
                    });
                }

                // Réservation atomique d'une place : la quantité de billets est limitée
                const ticketType = await TicketTypesModel.findOneAndUpdate(
                    {
                        _id: ticketTypeId,
                        event: event._id,
                        $expr: { $lt: ['$sold', '$quantity'] }
                    },
                    { $inc: { sold: 1 } },
                    { new: true }
                );

                if (!ticketType) {
                    const exists = await TicketTypesModel.exists({ _id: ticketTypeId, event: event._id });

                    return exists
                        ? res.status(409).json({ code: 409, message: 'This ticket type is sold out' })
                        : sendNotFound(res, 'Ticket type not found');
                }

                try {
                    await ticket.save();
                } catch (err) {
                    await TicketTypesModel.updateOne({ _id: ticketType._id }, { $inc: { sold: -1 } });

                    if (err?.code === 11000) {
                        return res.status(409).json({
                            code: 409,
                            message: 'This person already has a ticket for this event'
                        });
                    }

                    throw err;
                }

                res.status(201).json(ticket);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    getTickets() {
        this.app.get('/event/:idevent/tickets', this.authToken, async (req, res) => {
            try {
                const event = await this.findOrganizerEvent(req, res);

                if (!event) {
                    return;
                }

                const tickets = await TicketsModel.find({ event: event._id })
                    .sort({ purchased_at: 1 })
                    .populate('ticket_type', 'name amount');

                res.status(200).json(tickets);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    run() {
        this.getTicketTypes();
        this.createTicketType();
        this.updateTicketTypeById();
        this.deleteTicketTypeById();
        this.buyTicket();
        this.getTickets();
    }
};

export default Tickets;
