import mongoose from 'mongoose';

const AnswerSchema = new mongoose.Schema ({
    label: {
        type: String,
        required: true,
        trim: true,
        maxlength: [255, 'Answer must not exceed 255 characters']
    }
}, { versionKey: false });

const QuestionSchema = new mongoose.Schema ({
    label: {
        type: String,
        required: true,
        trim: true,
        maxlength: [255, 'Question must not exceed 255 characters']
    },
    answers: {
        type: [AnswerSchema],
        validate: {
            validator: (value) => Array.isArray(value) && value.length >= 2,
            message: 'A question must have at least 2 possible answers'
        }
    }
}, { versionKey: false });

const Schema = new mongoose.Schema ({
    title: {
        type: String,
        required: true,
        trim: true,
        minlength: [2, 'Title must contain at least 2 characters'],
        maxlength: [100, 'Title must not exceed 100 characters']
    },
    event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    questions: {
        type: [QuestionSchema],
        validate: {
            validator: (value) => Array.isArray(value) && value.length >= 1,
            message: 'A poll must have at least 1 question'
        }
    }
}, {
    collection: 'polls',
    minimize: false,
    versionKey: false,
    timestamps: true
});

export default mongoose.model('Poll', Schema);
