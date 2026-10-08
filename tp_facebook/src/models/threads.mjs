import mongoose from 'mongoose';

const Schema = new mongoose.Schema ({
    group: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group'
    },
    event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event'
    }
}, {
    collection: 'threads',
    minimize: false,
    versionKey: false,
    timestamps: true
});

// Un fil de discussion est lié à 1 groupe OU 1 événement, mais pas les deux
Schema.pre('validate', function () {
    if (Boolean(this.group) === Boolean(this.event)) {
        this.invalidate('group', 'A thread must be linked to either a group or an event, not both');
    }
});

// Un seul fil de discussion par groupe et par événement
Schema.index({ group: 1 }, { unique: true, partialFilterExpression: { group: { $exists: true } } });
Schema.index({ event: 1 }, { unique: true, partialFilterExpression: { event: { $exists: true } } });

export default mongoose.model('Thread', Schema);
