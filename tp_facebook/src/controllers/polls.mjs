import PollsModel from '../models/polls.mjs';
import PollResponsesModel from '../models/poll_responses.mjs';
import EventsModel from '../models/events.mjs';
import { isObjectId, validateRequestBody } from '../validation.mjs';
import { handleError, sendBadRequest, sendForbidden, sendNotFound } from '../errors.mjs';
import { canViewEvent, isEventOrganizer, isEventParticipant } from '../permissions.mjs';

const Polls = class Polls {
    constructor(app){
        this.app = app;
        this.run();
    }

    async findEvent(req, res) {
        if (!isObjectId(req.params.idevent)) {
            sendBadRequest(res, 'Invalid event id');
            return null;
        }

        const event = await EventsModel.findById(req.params.idevent);

        if (!event || !canViewEvent(event, req.auth.sub)) {
            sendNotFound(res, 'Event not found');
            return null;
        }

        return event;
    }

    async findPoll(req, res) {
        if (!isObjectId(req.params.id)) {
            sendBadRequest(res, 'Invalid poll id');
            return {};
        }

        const poll = await PollsModel.findById(req.params.id);
        const event = poll ? await EventsModel.findById(poll.event) : null;

        if (!poll || !event || !canViewEvent(event, req.auth.sub)) {
            sendNotFound(res, 'Poll not found');
            return {};
        }

        return { poll, event };
    }

    // Vérifie la forme des questions : [{ label, answers: ['...', '...'] }]
    validateQuestions(questions) {
        const errors = [];

        if (questions.length === 0) {
            errors.push({ field: 'questions', message: 'A poll must have at least 1 question' });
        }

        questions.forEach((question, index) => {
            const field = `questions.${index}`;

            if (!question || typeof question !== 'object' || Array.isArray(question)) {
                errors.push({ field, message: 'Must be an object' });
                return;
            }

            if (typeof question.label !== 'string' || question.label.trim().length === 0) {
                errors.push({ field: `${field}.label`, message: 'This field is required' });
            }

            if (
                !Array.isArray(question.answers) ||
                question.answers.length < 2 ||
                !question.answers.every((answer) => typeof answer === 'string' && answer.trim().length > 0)
            ) {
                errors.push({
                    field: `${field}.answers`,
                    message: 'Must be an array of at least 2 non-empty strings'
                });
            }
        });

        return errors;
    }

    getPolls() {
        this.app.get('/event/:idevent/polls', async (req, res) => {
            try {
                const event = await this.findEvent(req, res);

                if (!event) {
                    return;
                }

                const polls = await PollsModel.find({ event: event._id });
                res.status(200).json(polls);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    getPollById() {
        this.app.get('/poll/:id', async (req, res) => {
            try {
                const { poll } = await this.findPoll(req, res);

                if (poll) {
                    res.status(200).json(poll);
                }
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    createPoll() {
        this.app.post('/event/:idevent/poll', async (req, res) => {
            if (!validateRequestBody(req, res, {
                title: { type: 'string', required: true, minLength: 2, maxLength: 100 },
                questions: { type: 'array', required: true }
            })) {
                return;
            }

            const errors = this.validateQuestions(req.body.questions);
            if (errors.length > 0) {
                return sendBadRequest(res, 'Validation failed', errors);
            }

            try {
                const event = await this.findEvent(req, res);

                if (!event) {
                    return;
                }

                if (!isEventOrganizer(event, req.auth.sub)) {
                    return sendForbidden(res, 'Only event organizers can create polls');
                }

                const poll = await PollsModel.create({
                    title: req.body.title,
                    event: event._id,
                    author: req.auth.sub,
                    questions: req.body.questions.map(({ label, answers }) => ({
                        label,
                        answers: answers.map((answer) => ({ label: answer }))
                    }))
                });

                res.status(201).json(poll);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    deletePollById() {
        this.app.delete('/poll/:id', async (req, res) => {
            try {
                const { poll, event } = await this.findPoll(req, res);

                if (!poll) {
                    return;
                }

                if (!isEventOrganizer(event, req.auth.sub)) {
                    return sendForbidden(res, 'Only event organizers can delete polls');
                }

                await poll.deleteOne();
                await PollResponsesModel.deleteMany({ poll: poll._id });

                res.status(200).json(poll);
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    answerPoll() {
        this.app.post('/poll/:id/response', async (req, res) => {
            if (!validateRequestBody(req, res, {
                answers: { type: 'array', required: true }
            })) {
                return;
            }

            try {
                const { poll, event } = await this.findPoll(req, res);

                if (!poll) {
                    return;
                }

                if (!isEventParticipant(event, req.auth.sub)) {
                    return sendForbidden(res, 'Only event participants can answer polls');
                }

                // Une seule réponse par question, et chaque question doit recevoir une réponse
                const errors = [];
                const answered = new Set();

                for (const [index, item] of req.body.answers.entries()) {
                    const question = isObjectId(item?.question) ? poll.questions.id(item.question) : null;

                    if (!question) {
                        errors.push({ field: `answers.${index}.question`, message: 'Unknown question' });
                    } else if (answered.has(String(question._id))) {
                        errors.push({ field: `answers.${index}.question`, message: 'Only 1 answer per question' });
                    } else if (!isObjectId(item?.answer) || !question.answers.id(item.answer)) {
                        errors.push({ field: `answers.${index}.answer`, message: 'Unknown answer for this question' });
                    } else {
                        answered.add(String(question._id));
                    }
                }

                for (const question of poll.questions) {
                    if (!answered.has(String(question._id)) && errors.length === 0) {
                        errors.push({ field: 'answers', message: `Question "${question.label}" must be answered` });
                    }
                }

                if (errors.length > 0) {
                    return sendBadRequest(res, 'Validation failed', errors);
                }

                const response = await PollResponsesModel.create({
                    poll: poll._id,
                    user: req.auth.sub,
                    answers: req.body.answers.map(({ question, answer }) => ({ question, answer }))
                });

                res.status(201).json(response);
            } catch (err) {
                if (err?.code === 11000) {
                    return res.status(409).json({
                        code: 409,
                        message: 'You have already answered this poll'
                    });
                }

                handleError(err, res);
            }
        });
    }

    getPollResults() {
        this.app.get('/poll/:id/results', async (req, res) => {
            try {
                const { poll } = await this.findPoll(req, res);

                if (!poll) {
                    return;
                }

                const responses = await PollResponsesModel.find({ poll: poll._id });
                const counts = {};

                for (const response of responses) {
                    for (const { answer } of response.answers) {
                        counts[String(answer)] = (counts[String(answer)] || 0) + 1;
                    }
                }

                res.status(200).json({
                    poll: poll._id,
                    title: poll.title,
                    participants: responses.length,
                    questions: poll.questions.map((question) => ({
                        _id: question._id,
                        label: question.label,
                        answers: question.answers.map((answer) => ({
                            _id: answer._id,
                            label: answer.label,
                            votes: counts[String(answer._id)] || 0
                        }))
                    }))
                });
            } catch (err) {
                handleError(err, res);
            }
        });
    }

    run() {
        this.getPolls();
        this.getPollById();
        this.createPoll();
        this.deletePollById();
        this.answerPoll();
        this.getPollResults();
    }
};

export default Polls;
