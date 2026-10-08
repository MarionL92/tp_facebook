import mongoose from 'mongoose';

const Schema = new mongoose.Schema ({
    content: {
        type: String,
        required: true,
        trim: true,
        maxlength: [2000, 'Content must not exceed 2000 characters']
    },
    thread: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Thread',
        required: true
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reply_to: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    }
}, {
    collection: 'messages',
    minimize: false,
    versionKey: false,
    timestamps: true
});

export default mongoose.model('Message', Schema);
