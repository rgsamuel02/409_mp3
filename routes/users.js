var mongoose = require('mongoose');
var User = require('../models/user');
var Task = require('../models/task');

module.exports = function (router) {

    // Validate MongoDB ObjectIds
    function validId(id) {
        return mongoose.Types.ObjectId.isValid(id) &&
            String(new mongoose.Types.ObjectId(id)) === id;
    }

    // Build a projection for the select query parameter
    function getSelection(select) {
        if (!select) return '';

        var fields = select.replace(/,/g, ' ').trim();

        // Mongoose automatically includes _id unless explicitly excluded.
        // Exclude it unless the client specifically requests it.
        if (!fields.split(/\s+/).includes('_id') &&
            !fields.split(/\s+/).includes('-_id')) {
            fields += ' -_id';
        }

        return fields;
    }

    // GET all users
    router.route('/users').get(async function (req, res) {
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
                var total = await User.countDocuments(where);

                return res.status(200).json({
                    message: 'User count retrieved successfully',
                    data: total
                });
            }

            var query = User.find(where);

            if (Object.keys(sort).length > 0) {
                query = query.sort(sort);
            }

            if (req.query.select) {
                query = query.select(getSelection(req.query.select));
            }

            if (skip > 0) {
                query = query.skip(skip);
            }

            if (limit > 0) {
                query = query.limit(limit);
            }

            var users = await query;

            return res.status(200).json({
                message: 'Users retrieved successfully',
                data: users
            });

        } catch (err) {
            if (err instanceof SyntaxError) {
                return res.status(400).json({
                    message: 'Invalid JSON in where or sort parameter',
                    data: null
                });
            }

            return res.status(500).json({
                message: 'Error retrieving users',
                data: null
            });
        }
    });

    // GET one user
    router.route('/users/:id').get(async function (req, res) {
        try {
            if (!validId(req.params.id)) {
                return res.status(404).json({
                    message: 'User not found',
                    data: null
                });
            }

            var query = User.findById(req.params.id);

            if (req.query.select) {
                query = query.select(getSelection(req.query.select));
            }

            var user = await query;

            if (!user) {
                return res.status(404).json({
                    message: 'User not found',
                    data: null
                });
            }

            return res.status(200).json({
                message: 'User retrieved successfully',
                data: user
            });

        } catch (err) {
            return res.status(500).json({
                message: 'Error retrieving user',
                data: null
            });
        }
    });

    // POST create user
    router.route('/users').post(async function (req, res) {
        try {
            if (typeof req.body.name !== 'string' ||
                !req.body.name.trim() ||
                typeof req.body.email !== 'string' ||
                !req.body.email.trim()) {
                return res.status(400).json({
                    message: 'Name and email are required',
                    data: null
                });
            }

            var user = new User({
                name: req.body.name.trim(),
                email: req.body.email.trim(),
                pendingTasks: []
            });

            await user.save();

            return res.status(201).json({
                message: 'User created successfully',
                data: user
            });

        } catch (err) {
            if (err.code === 11000) {
                return res.status(400).json({
                    message: 'Email already exists',
                    data: null
                });
            }

            if (err.name === 'ValidationError') {
                return res.status(400).json({
                    message: err.message,
                    data: null
                });
            }

            return res.status(500).json({
                message: 'Error creating user',
                data: null
            });
        }
    });

    // PUT update user
    router.route('/users/:id').put(async function (req, res) {
        try {
            // Validate URL ID first
            if (!validId(req.params.id)) {
                return res.status(404).json({
                    message: 'User not found',
                    data: null
                });
            }

            var user = await User.findById(req.params.id);

            if (!user) {
                return res.status(404).json({
                    message: 'User not found',
                    data: null
                });
            }

            var body = req.body;

            // Validate required user fields
            if (typeof body.name !== 'string' || !body.name.trim() ||
                typeof body.email !== 'string' || !body.email.trim()) {
                return res.status(400).json({
                    message: 'Name and email are required',
                    data: null
                });
            }

            // Validate pendingTasks format
            var pendingIds = body.pendingTasks === undefined
                ? []
                : body.pendingTasks;

            if (!Array.isArray(pendingIds) ||
                !pendingIds.every(function (id) {
                    return typeof id === 'string' && validId(id);
                })) {
                return res.status(400).json({
                    message: 'pendingTasks must be an array of valid task IDs',
                    data: null
                });
            }

            // Remove duplicate IDs
            pendingIds = [...new Set(pendingIds)];

            // Check for duplicate email
            var duplicate = await User.findOne({
                email: body.email.trim(),
                _id: { $ne: user._id }
            });

            if (duplicate) {
                return res.status(400).json({
                    message: 'Email already exists',
                    data: null
                });
            }

            // Validate every submitted task before changing anything
            var newTasks = [];

            if (pendingIds.length > 0) {
                newTasks = await Task.find({
                    _id: { $in: pendingIds }
                });

                if (newTasks.length !== pendingIds.length) {
                    return res.status(404).json({
                        message: 'One or more tasks were not found',
                        data: null
                    });
                }

                // Completed tasks cannot be pending
                if (newTasks.some(function (task) {
                    return task.completed;
                })) {
                    return res.status(400).json({
                        message: 'Completed tasks cannot be pending',
                        data: null
                    });
                }
            }

            var oldName = user.name;
            var userId = user._id.toString();

            // Find old pending tasks that are being removed
            var oldPendingIds = user.pendingTasks || [];
            var removedIds = oldPendingIds.filter(function (id) {
                return !pendingIds.includes(id);
            });

            // Replace editable user fields
            user.name = body.name.trim();
            user.email = body.email.trim();
            user.pendingTasks = pendingIds;

            // Save user; dateCreated is not changed
            await user.save();

            // Tasks removed from pendingTasks become unassigned,
            // provided they are currently assigned to this user.
            if (removedIds.length > 0) {
                await Task.updateMany(
                    {
                        _id: { $in: removedIds },
                        assignedUser: userId
                    },
                    {
                        $set: {
                            assignedUser: '',
                            assignedUserName: 'unassigned'
                        }
                    }
                );
            }

            // Assign every submitted task to this user.
            // If a task belonged to another user, remove its old reference.
            for (var task of newTasks) {
                if (task.assignedUser && task.assignedUser !== userId) {
                    await User.updateOne(
                        { _id: task.assignedUser },
                        { $pull: { pendingTasks: task._id.toString() } }
                    );
                }

                task.assignedUser = userId;
                task.assignedUserName = user.name;
                await task.save();
            }

            // Update the name on ALL tasks assigned to this user,
            // including completed tasks not present in pendingTasks.
            if (oldName !== user.name) {
                await Task.updateMany(
                    { assignedUser: userId },
                    { $set: { assignedUserName: user.name } }
                );
            }

            return res.status(200).json({
                message: 'User updated successfully',
                data: user
            });

        } catch (err) {
            if (err.code === 11000 || err.name === 'ValidationError' ||
                err.name === 'CastError') {
                return res.status(400).json({
                    message: err.message || 'Invalid user information',
                    data: null
                });
            }

            return res.status(500).json({
                message: 'Error updating user',
                data: null
            });
        }
    });

    // DELETE user
    router.route('/users/:id').delete(async function (req, res) {
        try {
            if (!validId(req.params.id)) {
                return res.status(404).json({
                    message: 'User not found',
                    data: null
                });
            }

            var user = await User.findById(req.params.id);

            if (!user) {
                return res.status(404).json({
                    message: 'User not found',
                    data: null
                });
            }

            // Unassign all tasks, including completed tasks
            await Task.updateMany(
                { assignedUser: user._id.toString() },
                {
                    $set: {
                        assignedUser: '',
                        assignedUserName: 'unassigned'
                    }
                }
            );

            await User.findByIdAndDelete(user._id);

            return res.status(204).send();

        } catch (err) {
            return res.status(500).json({
                message: 'Error deleting user',
                data: null
            });
        }
    });

    return router;
};