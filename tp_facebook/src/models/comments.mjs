import mongoose from 'mongoose';

const Schema = new mongoose.Schema ({
    content: {
        type: String,
        required: true,
        trim: true,
        maxlength: [1000, 'Content must not exceed 1000 characters']
    },
    photo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Photo',
        required: true
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    collection: 'comments',
    minimize: false,
    versionKey: false,
    timestamps: true
});

export default mongoose.model('Comment', Schema);
