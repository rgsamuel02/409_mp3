var mongoose = require('mongoose');
var Task = require('../models/task');
var User = require('../models/user');

module.exports = function (router) {
    // Helper: validate a MongoDB ID
    function validId(id) {
        return mongoose.Types.ObjectId.isValid(id) &&
            String(new mongoose.Types.ObjectId(id)) === id;
    }

    function getSelection(select) {
        if (!select) return '';

        var fields = select.replace(/,/g, ' ').trim();

        if (!fields.split(/\s+/).includes('_id') &&
            !fields.split(/\s+/).includes('-_id')) {
            fields += ' -_id';
        }

        return fields;
    }

    // GET all tasks with query parameter support
    router.route('/tasks').get(async function (req, res) {
        try {
            var where = {};
            var sort = {};

            if (req.query.where) {
                where = JSON.parse(req.query.where);

                if (typeof where !== 'object' || where === null ||
                    Array.isArray(where)) {
                    return res.status(400).json({
                        message: 'Invalid where parameter',
                        data: null
                    });
                }
            }

            if (req.query.sort) {
                sort = JSON.parse(req.query.sort);

                if (typeof sort !== 'object' || sort === null ||
                    Array.isArray(sort)) {
                    return res.status(400).json({
                        message: 'Invalid sort parameter',
                        data: null
                    });
                }
            }

            var skip = req.query.skip ? Number(req.query.skip) : 0;
            var limit = req.query.limit ? Number(req.query.limit) : 0;

            if (!Number.isInteger(skip) || skip < 0 ||
                !Number.isInteger(limit) || limit < 0) {
                return res.status(400).json({
                    message: 'Skip and limit must be nonnegative integers',
                    data: null
                });
            }

            if (req.query.count === 'true') {
                var total = await Task.countDocuments(where);

                return res.status(200).json({
                    message: 'Task count retrieved successfully',
                    data: total
                });
            }

            var query = Task.find(where);

            if (Object.keys(sort).length > 0) {
                query = query.sort(sort);
            }

            if (req.query.select) {
                query = query.select(req.query.select.replace(/,/g, ' '));
            }

            if (skip > 0) {
                query = query.skip(skip);
            }

            if (limit > 0) {
                query = query.limit(limit);
            }

            var tasks = await query;

            return res.status(200).json({
                message: 'Tasks retrieved successfully',
                data: tasks
            });

        } catch (err) {
            if (err instanceof SyntaxError) {
                return res.status(400).json({
                    message: 'Invalid JSON in where or sort parameter',
                    data: null
                });
            }

            return res.status(500).json({
                message: 'Error retrieving tasks',
                data: null
            });
        }
    });

    // GET one task
    router.route('/tasks/:id').get(async function (req, res) {
        try {
            if (!validId(req.params.id)) {
                return res.status(404).json({
                    message: 'Task not found',
                    data: null
                });
            }

            var query = Task.findById(req.params.id);

            if (req.query.select) {
                query = query.select(getSelection(req.query.select));
            }

            var task = await query;

            if (!task) {
                return res.status(404).json({
                    message: 'Task not found',
                    data: null
                });
            }

            return res.status(200).json({
                message: 'Task retrieved successfully',
                data: task
            });

        } catch (err) {
            return res.status(500).json({
                message: 'Error retrieving task',
                data: null
            });
        }
    });

    // POST create a task
    router.route('/tasks').post(async function (req, res) {
        try {
            var body = req.body;

            if (typeof body.name !== 'string' || !body.name.trim()) {
                return res.status(400).json({
                    message: 'Task name is required',
                    data: null
                });
            }

            if (!body.deadline ||
                isNaN(new Date(body.deadline).getTime())) {
                return res.status(400).json({
                    message: 'A valid deadline is required',
                    data: null
                });
            }

            if (body.completed !== undefined &&
                typeof body.completed !== 'boolean') {
                return res.status(400).json({
                    message: 'Completed must be a boolean',
                    data: null
                });
            }

            var assignedUserId = body.assignedUser || '';
            var assignedUser = null;

            if (typeof assignedUserId !== 'string') {
                return res.status(400).json({
                    message: 'Assigned user must be a user ID string',
                    data: null
                });
            }

            if (assignedUserId !== '') {
                if (!validId(assignedUserId)) {
                    return res.status(400).json({
                        message: 'Invalid assigned user ID',
                        data: null
                    });
                }

                assignedUser = await User.findById(assignedUserId);

                if (!assignedUser) {
                    return res.status(404).json({
                        message: 'Assigned user not found',
                        data: null
                    });
                }
            }

            var task = new Task({
                name: body.name.trim(),
                description: body.description === undefined
                    ? ''
                    : body.description,
                deadline: body.deadline,
                completed: body.completed === undefined
                    ? false
                    : body.completed,
                assignedUser: assignedUserId,
                assignedUserName: assignedUser
                    ? assignedUser.name
                    : 'unassigned'
            });

            await task.save();

            // Only incomplete assigned tasks belong in pendingTasks
            if (assignedUser && !task.completed) {
                await User.updateOne(
                    { _id: assignedUser._id },
                    { $addToSet: { pendingTasks: task._id.toString() } }
                );
            }

            return res.status(201).json({
                message: 'Task created successfully',
                data: task
            });

        } catch (err) {
            if (err.name === 'ValidationError' ||
                err.name === 'CastError') {
                return res.status(400).json({
                    message: err.message,
                    data: null
                });
            }

            return res.status(500).json({
                message: 'Error creating task',
                data: null
            });
        }
    });

    // PUT update a task
    router.route('/tasks/:id').put(async function (req, res) {
        try {
            // Check URL ID first
            if (!validId(req.params.id)) {
                return res.status(404).json({
                    message: 'Task not found',
                    data: null
                });
            }

            var task = await Task.findById(req.params.id);

            if (!task) {
                return res.status(404).json({
                    message: 'Task not found',
                    data: null
                });
            }

            var body = req.body;

            // Validate required replacement fields
            if (typeof body.name !== 'string' || !body.name.trim()) {
                return res.status(400).json({
                    message: 'Task name is required',
                    data: null
                });
            }

            if (!body.deadline ||
                isNaN(new Date(body.deadline).getTime())) {
                return res.status(400).json({
                    message: 'A valid deadline is required',
                    data: null
                });
            }

            var completed = body.completed === undefined
                ? false
                : body.completed;

            if (typeof completed !== 'boolean') {
                return res.status(400).json({
                    message: 'Completed must be a boolean',
                    data: null
                });
            }

            var assignedUserId = body.assignedUser || '';
            var newUser = null;

            if (typeof assignedUserId !== 'string') {
                return res.status(400).json({
                    message: 'Assigned user must be a user ID string',
                    data: null
                });
            }

            // Validate the new assigned user before changing anything
            if (assignedUserId !== '') {
                if (!validId(assignedUserId)) {
                    return res.status(400).json({
                        message: 'Invalid assigned user ID',
                        data: null
                    });
                }

                newUser = await User.findById(assignedUserId);

                if (!newUser) {
                    return res.status(404).json({
                        message: 'Assigned user not found',
                        data: null
                    });
                }
            }
            if (body.assignedUserName !== undefined) {
                if (typeof body.assignedUserName !== 'string') {
                    return res.status(400).json({
                        message: 'Invalid assigned user name',
                        data: null
                    });
                }

                var expectedName = newUser ? newUser.name : 'unassigned';

                if (body.assignedUserName !== expectedName) {
                    return res.status(400).json({
                        message: 'Assigned user name does not match assigned user',
                        data: null
                    });
                }
            }

            var oldUserId = task.assignedUser;

            // Replace task fields. Omitted optional fields use defaults.
            task.name = body.name.trim();
            task.description = body.description === undefined
                ? ''
                : body.description;
            task.deadline = body.deadline;
            task.completed = completed;
            task.assignedUser = assignedUserId;
            task.assignedUserName = newUser
                ? newUser.name
                : 'unassigned';

            // dateCreated is intentionally not changed
            await task.save();

            // Remove this task from the previous user's pending list
            if (oldUserId) {
                await User.updateOne(
                    { _id: oldUserId },
                    { $pull: { pendingTasks: task._id.toString() } }
                );
            }

            // Add it to the new user's pending list only if incomplete
            if (newUser && !task.completed) {
                await User.updateOne(
                    { _id: newUser._id },
                    { $addToSet: { pendingTasks: task._id.toString() } }
                );
            }

            return res.status(200).json({
                message: 'Task updated successfully',
                data: task
            });

        } catch (err) {
            if (err.name === 'ValidationError' ||
                err.name === 'CastError') {
                return res.status(400).json({
                    message: err.message,
                    data: null
                });
            }

            return res.status(500).json({
                message: 'Error updating task',
                data: null
            });
        }
    });

    // DELETE a task
    router.route('/tasks/:id').delete(async function (req, res) {
        try {
            if (!validId(req.params.id)) {
                return res.status(404).json({
                    message: 'Task not found',
                    data: null
                });
            }

            var task = await Task.findById(req.params.id);

            if (!task) {
                return res.status(404).json({
                    message: 'Task not found',
                    data: null
                });
            }

            // Remove task reference from its assigned user
            if (task.assignedUser) {
                await User.updateOne(
                    { _id: task.assignedUser },
                    { $pull: { pendingTasks: task._id.toString() } }
                );
            }

            await Task.findByIdAndDelete(task._id);

            return res.status(204).send();

        } catch (err) {
            return res.status(500).json({
                message: 'Error deleting task',
                data: null
            });
        }
    });

    return router;
};
