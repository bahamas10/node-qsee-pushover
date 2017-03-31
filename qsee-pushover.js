#!/usr/bin/env node
/**
 * Alert (notify) when Q-See get alerts
 *
 * Author: Dave Eddy <dave@daveeddy.com>
 * Date: March 23, 2017
 * License: MIT
 */

var fs = require('fs');
var f = require('util').format;

var Pushover = require('pushover-notifications');
var QSeeAlertsServer = require('qsee-alerts').QSeeAlertsServer;
var WorkingHours = require('working-hours').WorkingHours;
var assert = require('assert-plus');
var bunyan = require('bunyan');
var getopt = require('posix-getopt');
var has = require('has');
var jsprim = require('jsprim');

var package = require('./package.json');

var log = bunyan.createLogger({name: 'qsee-pushover'});

var usage = [
    'usage: qsee-pushover [-huv] <config.json>',
    '',
    'alert (notify) when Q-See gets alerts',
    '',
    'options',
    '',
    '  -h, --help       print this message and exit',
    '  -u, --updates    check for available updates',
    '  -v, --version    print the version number and exit',
].join('\n');

var options = [
  'h(help)',
  'u(updates)',
  'v(version)'
].join('');
var parser = new getopt.BasicParser(options, process.argv);

var option;
while ((option = parser.getopt())) {
    switch (option.option) {
        case 'h': console.log(usage); process.exit(0);
        case 'u': // check for updates
            require('latest').checkupdate(package, function(ret, msg) {
                console.log(msg);
                process.exit(ret);
            });
            return;
        case 'v': console.log(package.version); process.exit(0);
        default: console.error(usage); process.exit(1);
    }
}

var args = process.argv.slice(parser.optind());
var config = args[0] || process.env.QSEE_PUSHOVER_CONFIG;

assert.string(config, 'config must be set as the first argument or env DHCPD_NOTIFIER_CONFIG');
config = JSON.parse(fs.readFileSync(config, 'utf8'));

assert.object(config, 'config');
assert.object(config.pushover, 'config.pushover');
assert.object(config.qsee_alerts, 'config.qsee_alerts');
assert.optionalString(config.log_level, 'config.log_level');

if (config.log_level !== undefined) {
    log.level(config.log_level);
}

var qsee = new QSeeAlertsServer(config.qsee_alerts);
var po = new Pushover(config.pushover);
var schedules;
if (config.hasOwnProperty('schedule')) {
    schedules = jsprim.deepCopy(config.schedule);
    log.debug({schedules: schedules}, 'parsing config schedules');

    assert.object(schedules.times, 'config.schedule.times');
    assert.optionalString(schedules.default, 'cnofig.schedule.default');
    assert.optionalObject(schedules.channels, 'config.schedule.channels');

    Object.keys(schedules.times).forEach(function (k) {
        schedules.times[k] = new WorkingHours(schedules.times[k]);
    });

    if (schedules.default !== undefined) {
        assert(has(schedules.times, schedules.default), 'default schedule unknown');
        schedules.default = schedules.times[schedules.default];
    }
    if (schedules.channels !== undefined) {
        Object.keys(schedules.channels).forEach(function (ch) {
            assert(has(schedules.times, schedules.channels[ch]), 'camera channel unknown');
            schedules.channels[ch] = schedules.times[schedules.channels[ch]];
        });
    }

    delete schedules.times;
}

var cd;
if (config.hasOwnProperty('cooldown')) {
    cd = jsprim.deepCopy(config.cooldown);
    log.debug({cd: cd}, 'parsing config cooldown');

    assert.number(cd.time, 'config.cooldown.time');
    assert.optionalBool(cd.per_camera, 'config.cooldown.per_camera');
    assert.optionalBool(cd.summarize, 'config.cooldown.summarize');

    cd.cooldown = {};
}

qsee.on('ready', function () {
    log.info({opts: config.qsee_alerts}, 'server running');
});

qsee.on('warning', function (err) {
    log.warn({err: err}, 'Q-See Alerts warning: %s', err.message);
});

qsee.on('alert', function (obj) {
    var alarm;
    var channel = obj.data['Channel ID'];
    assert.string(channel, 'channel');

    switch (obj.data['Alarm Type']) {
    case 'Motion Alarm':
        alarm = 'Motion detected';
        break;
    default:
        alarm = obj.data['Alarm Type'];
        break;
    }

    var s = f('%s %s (channel %s)',
        obj.data['Alarm Type'],
        obj.data['Camera Name'],
        channel);

    log.info({obj: obj}, s);

    // Check if we are scheduled
    if (schedules) {
        var sched;
        if (has(schedules, 'channels') && has(schedules.channels, channel)) {
            sched = schedules.channels[channel];
            log.debug('Schedule found for channel %s', channel);
        } else if (has(schedules, 'default')) {
            sched = schedules.default;
            log.debug('Using default schedule for channel %s', channel);
        } else {
            log.debug('No schedule found for channel %s, assuming 24x7', channel);
        }

        if (sched && !sched.test(obj.date)) {
            log.debug('Alert not scheduled for delivery, discarding');
            return;
        }
    }

    // check if we are on cooldown
    var cdkey = cd.per_camera ? channel : 'all';
    if (cd && cd.cooldown[cdkey] !== undefined) {
        log.debug('Not sending alert, cooldown active');
        cd.cooldown[cdkey].alerts.push(obj);
        return;
    }

    // if we are here, we are not on cooldown and we are scheduled for delivery!

    // activate cooldown
    if (cd) {
        setTimeout(function () {
            var len = cd.cooldown[cdkey].alerts.length;
            var camera = cd.cooldown[cdkey].camera;
            log.debug('Coming off cooldown for channel "%s" (%s), %d events seen',
                cdkey, camera, len);
            delete cd.cooldown[cdkey];

            if (!cd.summarize)
                return;

            if (len === 0)
                return;

            var s = f('%d alerts seen on %s in the last %d seconds',
                len,
                cdkey === 'all' ? 'all cameras' : camera,
                cd.time);

            log.debug(s);
            pushover('Alerts Summary', s);
        }, cd.time * 1000);

        cd.cooldown[cdkey] = {
            alerts: [],
            camera: cdkey === 'all' ? 'all cameras' : obj.data['Camera Name']
        };
    }

    // send the pushover
    pushover(alarm, s);
});

function pushover(title, message) {
    po.send({
        title: title,
        message: message
    }, function (err, res) {
        if (err) {
            log.error({err: err}, 'failed to send pushover: %s', err.message);
        } else {
            log.debug({msg: res}, 'sent pushover');
        }
    });
}
