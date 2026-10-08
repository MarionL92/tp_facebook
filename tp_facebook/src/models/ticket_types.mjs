import mongoose from 'mongoose';

const Schema = new mongoose.Schema ({
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: [2, 'Name must contain at least 2 characters'],
        maxlength: [100, 'Name must not exceed 100 characters']
    },
    amount: {
        type: Number,
        required: true,
        min: [0, 'Amount must be zero or greater']
    },
    quantity: {
        type: Number,
        required: true,
        min: [1, 'Quantity must be at least 1'],
        validate: {
            validator: Number.isInteger,
            message: 'Quantity must be an integer'
        }
    },
    sold: {
        type: Number,
        default: 0,
        min: 0
    },
    event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    }
}, {
    collection: 'ticket_types',
    minimize: false,
    versionKey: false,
    timestamps: true
});

export default mongoose.model('TicketType', Schema);
