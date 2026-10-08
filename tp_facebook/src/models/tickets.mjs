import mongoose from 'mongoose';
import validator from 'validator';

const Schema = new mongoose.Schema ({
    ticket_type: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TicketType',
        required: true
    },
    event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    },
    firstname: {
        type: String,
        required: true,
        trim: true,
        minlength: [2, 'First name must contain at least 2 characters'],
        maxlength: [50, 'First name must not exceed 50 characters']
    },
    lastname: {
        type: String,
        required: true,
        trim: true,
        minlength: [2, 'Last name must contain at least 2 characters'],
        maxlength: [50, 'Last name must not exceed 50 characters']
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        maxlength: [254, 'Email must not exceed 254 characters'],
        validate: {
            validator: validator.isEmail,
            message: 'Please provide a valid email address'
        }
    },
    address: {
        street: { type: String, required: true, trim: true, maxlength: 255 },
        zip_code: { type: String, required: true, trim: true, maxlength: 20 },
        city: { type: String, required: true, trim: true, maxlength: 100 },
        country: { type: String, required: true, trim: true, maxlength: 100 }
    },
    purchased_at: {
        type: Date,
        default: Date.now
    }
}, {
    collection: 'tickets',
    minimize: false,
    versionKey: false
});

// Une personne extérieure ne peut obtenir qu'un seul billet par événement
Schema.index({ event: 1, email: 1 }, { unique: true });

export default mongoose.model('Ticket', Schema);
