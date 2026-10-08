import mongoose from 'mongoose';

const Schema = new mongoose.Schema ({
    title: {
        type: String,
        required: true,
        trim: true,
        minlength: [2, 'Title must contain at least 2 characters'],
        maxlength: [100, 'Title must not exceed 100 characters']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [1000, 'Description must not exceed 1000 characters']
    },
    event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    },
    photos: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Photo'
    }],
    created_at: {
        type: Date,
        default: Date.now
    }
}, {
    collection: 'albums',
    minimize: false,
    versionKey: false
});

export default mongoose.model('Album', Schema);
