'use strict';

const path = require(`path`);
const { tests } = require(`@iobroker/testing`);

// Run tests
tests.unit(path.join(__dirname, `..`));

// Exercise the additional text/JSON item and image-upload commands.
require('./bringExtensions');
