import mongoose from 'mongoose';

const Schema = new mongoose.Schema ({
    poll: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Poll',
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    answers: [{
        _id: false,
        question: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },
        answer: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        }
    }]
}, {
    collection: 'poll_responses',
    minimize: false,
    versionKey: false,
    timestamps: true
});

// Un participant ne répond qu'une seule fois à un sondage
Schema.index({ poll: 1, user: 1 }, { unique: true });

export default mongoose.model('PollResponse', Schema);
