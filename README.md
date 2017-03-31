Q-See QT Pushover Notifier
==========================

Alert (pushover) when an alarm is seen by a Q-See QT NVR device

NOTE: This is a command-line tool to be run as a daemon

Installation
------------

    [sudo] npm install -g qsee-pushover

Usage
-----

Create a configuration JSON file

``` json
{
    "log_level": "debug",
    "cooldown": {
        "time": 300,
        "per_camera": true,
        "summarize": true
    },
    "schedule": {
        "times": {
            "24x7": true,
            "never": false,
            "after-midnight": "00:00-09-00"
        },
        "default": "after-midnight",
        "channels": {
            "1": "never",
            "2": "24x7"
        }
    },
    "qsee_alerts": {
        "host": "0.0.0.0",
        "port": "10465",
        "username": "foo@test.com",
        "password": "bar"
    },
    "pushover": {
        "user": "_pushover_user_",
        "token": "_pushover_token_"
    }
}
```

Start the daemon with the config

```
$ qsee-pushover config.json | bunyan
[2017-03-31T04:25:42.053Z]  INFO: qsee-pushover/38355 on arbiter.rapture.com: server running
    opts: {
      "host": "0.0.0.0",
      "port": 10465,
      "username": "foo@test.com",
      "password": "bar"
    }
```

All logging is done through [Bunyan](https://github.com/trentm/node-bunyan)

Configuration
-------------

#### `log_level` (optional)

Bunyan log level to use, default is INFO

#### `cooldown` (optional)

Used to specify a "cooldown" for alerts.  This means, when an alert is seen, a
certain amount of time must pass (cooldown timer) before another alert is sent.

- `cooldown.time` time (in seconds) to wait after an event is seen to send another alert
- `cooldown.per_camera` if the cooldown is done on a per-camera basis, default is false (all cameras)
- `colldown.summarize` send a "summary" of all events seen during the cooldown period after the timer has finished, default is false

#### `schedule` (optional)

A schedule or schedules to use when deciding whether or not to send an alert.
Schedules are done using the [Working Hours](https://github.com/bahamas10/node-working-hours)
module.

- `schedule.times` a key-value mapping of schedule name to the actual schedule (in WorkingHours format)
- `schedule.channels` a mapping of channel id to schedule to use
- `schedule.default` the default schedule to use if a schedule is not specified for the channel

If a channel doesn't match a schedule, it defaults to no schedule which is effectively 24x7 alerts.

#### `qsee_alerts` (required)

The SMTP server config for the Q-See QT DVR to use.

This object is passed directly to the [QSeeAlertsServer](https://github.com/bahamas10/node-qsee-alerts)
constructor.

#### `pushover` (required)

The pushover credentials to use when sending the alert.

This object is passed directly to the [PushoverNotifications](https://github.com/qbit/node-pushover)

License
-------

MIT License
