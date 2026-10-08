import mongoose from 'mongoose';

const Schema = new mongoose.Schema ({
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: [2, 'Name must contain at least 2 characters'],
        maxlength: [100, 'Name must not exceed 100 characters']
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
    arrival_time: {
        type: Date,
        required: true
    },
    event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    collection: 'shopping_items',
    minimize: false,
    versionKey: false,
    timestamps: true
});

// Chaque chose apportée doit être unique par événement (sans tenir compte des majuscules)
Schema.index(
    { event: 1, name: 1 },
    { unique: true, collation: { locale: 'fr', strength: 2 } }
);

export default mongoose.model('ShoppingItem', Schema);
