import mongoose from 'mongoose';
import validator from 'validator';

const urlValidator = {
    validator: (value) => validator.isURL(value, {
        protocols: ['http', 'https'],
        require_protocol: true
    }),
    message: 'Must be a valid HTTP or HTTPS URL'
};

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
    icon: {
        type: String,
        trim: true,
        maxlength: [2048, 'URL must not exceed 2048 characters'],
        validate: urlValidator
    },
    cover_photo: {
        type: String,
        trim: true,
        maxlength: [2048, 'URL must not exceed 2048 characters'],
        validate: urlValidator
    },
    type: {
        type: String,
        enum: ['public', 'private', 'secret'],
        default: 'public'
    },
    allow_members_to_post: {
        type: Boolean,
        default: true
    },
    allow_members_to_create_events: {
        type: Boolean,
        default: false
    },
    admins: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    members: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }]
}, {
    collection: 'groups',
    minimize: false,
    versionKey: false,
    timestamps: true
});

Schema.pre('validate', function () {
    if (!Array.isArray(this.admins) || this.admins.length === 0) {
        this.invalidate('admins', 'A group must have at least one administrator');
    }
});

export default mongoose.model('Group', Schema);
