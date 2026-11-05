/*
 * Connect all of your endpoints together here.
 */

module.exports = function (app, router) {
    // Home route
    require('./home.js')(router);

    // User routes
    require('./users.js')(router);

    // Task routes
    require('./tasks.js')(router);

    // Mount all routes under /api
    app.use('/api', router);

    return app;
};
