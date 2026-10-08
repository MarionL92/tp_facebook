import mongoose from 'mongoose';
import validator from 'validator';

const Schema = new mongoose.Schema ({
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: [2, 'Name must contain at least 2 characters'],
        maxlength: [100, 'Name must not exceed 100 characters']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [2000, 'Description must not exceed 2000 characters']
    },
    start_date: {
        type: Date,
        required: true
    },
    end_date: {
        type: Date,
        required: true
    },
    location: {
        type: String,
        required: true,
        trim: true,
        maxlength: [255, 'Location must not exceed 255 characters']
    },
    cover_photo: {
        type: String,
        trim: true,
        maxlength: [2048, 'URL must not exceed 2048 characters'],
        validate: {
            validator: (value) => validator.isURL(value, {
                protocols: ['http', 'https'],
                require_protocol: true
            }),
            message: 'Cover photo must be a valid HTTP or HTTPS URL'
        }
    },
    visibility: {
        type: String,
        enum: ['public', 'private'],
        default: 'public'
    },
    group: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group'
    },
    organizers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    members: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    ticketing: {
        type: Boolean,
        default: false
    },
    shopping_list: {
        type: Boolean,
        default: false
    },
    carpooling: {
        type: Boolean,
        default: false
    }
}, {
    collection: 'events',
    minimize: false,
    versionKey: false,
    timestamps: true
});

Schema.pre('validate', function () {
    if (this.start_date && this.end_date && this.end_date < this.start_date) {
        this.invalidate('end_date', 'End date must be after start date');
    }

    if (!Array.isArray(this.organizers) || this.organizers.length === 0) {
        this.invalidate('organizers', 'An event must have at least one organizer');
    }

    // Seuls les événements publics peuvent posséder une billetterie
    if (this.ticketing && this.visibility !== 'public') {
        this.invalidate('ticketing', 'Only public events can have a ticketing');
    }
});

export default mongoose.model('Event', Schema);
