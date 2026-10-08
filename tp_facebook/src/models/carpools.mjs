import mongoose from 'mongoose';

const Schema = new mongoose.Schema ({
    departure_location: {
        type: String,
        required: true,
        trim: true,
        minlength: [2, 'Departure location must contain at least 2 characters'],
        maxlength: [255, 'Departure location must not exceed 255 characters']
    },
    departure_time: {
        type: Date,
        required: true
    },
    price: {
        type: Number,
        required: true,
        min: [0, 'Price must be zero or greater']
    },
    seats: {
        type: Number,
        required: true,
        min: [1, 'Seats must be at least 1'],
        validate: {
            validator: Number.isInteger,
            message: 'Seats must be an integer'
        }
    },
    // Temps maximum d'écart accepté sur le trajet, en minutes
    max_detour: {
        type: Number,
        required: true,
        min: [0, 'Max detour must be zero or greater'],
        validate: {
            validator: Number.isInteger,
            message: 'Max detour must be an integer (minutes)'
        }
    },
    event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    },
    driver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    passengers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }]
}, {
    collection: 'carpools',
    minimize: false,
    versionKey: false,
    timestamps: true
});

Schema.pre('validate', function () {
    if (Array.isArray(this.passengers) && this.passengers.length > this.seats) {
        this.invalidate('seats', 'Seats cannot be lower than the number of passengers');
    }
});

export default mongoose.model('Carpool', Schema);
