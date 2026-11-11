#!/usr/bin/env python
# -*- coding: utf-8 -*-

# Copyright (C) 2018-2026 Vasily Evseenko <svpcom@p2ptech.org>

#
#   This program is free software; you can redistribute it and/or modify
#   it under the terms of the GNU General Public License as published by
#   the Free Software Foundation; version 3.
#
#   This program is distributed in the hope that it will be useful,
#   but WITHOUT ANY WARRANTY; without even the implied warranty of
#   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#   GNU General Public License for more details.
#
#   You should have received a copy of the GNU General Public License along
#   with this program; if not, write to the Free Software Foundation, Inc.,
#   51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
#

import struct
from twisted.trial import unittest
from ..mavlink import MAVLink, MAVLink_heartbeat_message, mavlink_map, x25crc
from ..mavlink_protocol import mavlink_parser_gen


def heartbeat(mav, force_mavlink1=False):
    return MAVLink_heartbeat_message(1, 8, 128, 0, 0, 1).pack(mav, force_mavlink1=force_mavlink1)


class MavlinkParserTestCase(unittest.TestCase):
    def setUp(self):
        self.mav = MAVLink(None, srcSystem=1, srcComponent=1)
        self.fsm = mavlink_parser_gen()
        self.fsm.send(None)

    def parse(self, data):
        # A false sync inside garbage may wait for more bytes, feed filler to resolve it
        return self.fsm.send(data) + self.fsm.send(b'\0' * 300)

    def test_valid_frames(self):
        for v1 in (True, False):
            m = heartbeat(self.mav, v1)
            self.assertEqual(self.parse(m), [m])

    def test_bad_crc_is_dropped(self):
        for v1 in (True, False):
            bad = bytearray(heartbeat(self.mav, v1))
            bad[-1] ^= 0xff
            good = heartbeat(self.mav, v1)
            self.assertEqual(self.parse(bytes(bad) + good), [good])

    def test_bad_length_does_not_eat_frames(self):
        # heartbeat header with a corrupted length byte, followed by good frames
        bad_hdr = b'\xfd\xff\x00\x00\x00\x01\x01\x00\x00\x00'
        frames = [heartbeat(self.mav) for _ in range(20)]
        self.assertEqual(self.parse(bad_hdr + b''.join(frames)), frames)

    def test_unknown_msg_id_is_passed_through(self):
        msg_id = 150  # ardupilotmega SENSOR_OFFSETS, not in the generated dialect
        self.assertNotIn(msg_id, mavlink_map)
        frame = b'\xfd\x03\x00\x00\x01\x01\x01' + struct.pack('<HB', msg_id & 0xffff, msg_id >> 16) + b'abc\x00\x00'
        self.assertEqual(self.parse(frame), [frame])

    def test_unknown_incompat_flags_are_dropped(self):
        frame = bytearray(heartbeat(self.mav))
        frame[2] = 0x02
        crc = x25crc(frame[1:-2])
        crc.accumulate(bytes((MAVLink_heartbeat_message.crc_extra,)))
        frame[-2:] = struct.pack('<H', crc.crc)
        good = heartbeat(self.mav)
        self.assertEqual(self.parse(bytes(frame) + good), [good])
