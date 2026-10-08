import mongoose from 'mongoose';
import validator from 'validator';

const Schema = new mongoose.Schema ({
    title: {
        type: String,
        required: true,
        trim: true,
        minlength: [2, 'Title must contain at least 2 characters'],
        maxlength: [100, 'Title must not exceed 100 characters']
    },
    url: {
        type: String,
        required: true,
        trim: true,
        maxlength: [2048, 'URL must not exceed 2048 characters'],
        validate: {
            validator: (value) => validator.isURL(value, {
                protocols: ['http', 'https'],
                require_protocol: true
            }),
            message: 'URL must be a valid HTTP or HTTPS URL'
        }
    },
    description: {
        type: String,
        trim: true,
        maxlength: [1000, 'Description must not exceed 1000 characters']
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    album: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Album',
        required: true
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    collection: 'photos',
    minimize: false,
    versionKey: false
});

export default mongoose.model('Photo', Schema);
