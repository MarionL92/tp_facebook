import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import validator from 'validator';

const Schema = new mongoose.Schema ({
    firstname: {
        type: String,
        required: true,
        trim: true,
        minlength: [2, 'First name must contain at least 2 characters'],
        maxlength: [50, 'First name must not exceed 50 characters'],
        match: [/^[a-zA-Z]+$/, 'First name may contain only ASCII letters']
    },
    lastname: {
        type: String,
        required: true,
        trim: true,
        minlength: [2, 'Last name must contain at least 2 characters'],
        maxlength: [50, 'Last name must not exceed 50 characters'],
        match: [/^[a-zA-Z]+$/, 'Last name may contain only ASCII letters']
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        maxlength: [254, 'Email must not exceed 254 characters'],
        unique: true,
        sparse: true,
        validate: {
            validator: validator.isEmail,
            message: 'Please provide a valid email address'
        }
    },
    password: {
        type: String,
        required: true,
        minlength: [8, 'Password must contain at least 8 characters'],
        select: false
    },
    age: {
        type: Number,
        required: true,
        min: [0, 'Age must be zero or greater'],
        validate: {
            validator: Number.isInteger,
            message: 'Age must be an integer'
        }
    }
}, {
    collection: 'users',
    minimize: false,
    versionKey: false,
    timestamps: true
});

Schema.pre('save', async function () {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 12);
    }
});

export default mongoose.model('User', Schema);
