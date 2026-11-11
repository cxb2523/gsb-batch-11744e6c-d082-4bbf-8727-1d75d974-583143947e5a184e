// -*- C++ -*-
//
// Copyright (C) 2026 Vasily Evseenko <svpcom@p2ptech.org>

/*
 *   This program is free software; you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation; version 3.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.
 *
 *   You should have received a copy of the GNU General Public License along
 *   with this program; if not, write to the Free Software Foundation, Inc.,
 *   51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 */

// wfb_audit: pure-function audit of wfb_tx_cmd control commands and wfb_rtsp
// parameters.
//
// The module consumes a plain-data snapshot (simulated argv, an optional
// control-response description and an RTSP configuration snapshot) and
// produces a plain-data, JSON-serializable audit result. It never opens
// sockets, never sends or receives packets, never touches network interfaces
// or key files and never mutates its input. All output objects contain only
// value types (bool / integers / std::string / std::vector) - no function
// pointers, no struct instances of the wire protocol, no exception objects.

#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace wfb_audit
{

// Expected response payload kind, mirroring the union members of cmd_resp_t
// that each command elicits (see send_command() in src/tx_cmd.c).
enum class PayloadKind
{
    NONE = 0,   // CMD_SET_* commands: empty response payload
    GET_FEC,    // CMD_GET_FEC: cmd_get_fec payload
    GET_RADIO   // CMD_GET_RADIO: cmd_get_radio payload
};

// Optional description of a control response (as would have been received by
// send_command()). present == false means "no response was captured".
struct ResponseDesc
{
    bool present = false;
    uint32_t req_id = 0;             // req_id found inside the response
    uint32_t rc = 0;                 // return code from the response, host order
    uint64_t actual_len = 0;         // number of bytes actually received
    PayloadKind expected_payload = PayloadKind::NONE; // per the request cmd_id
};

// Snapshot of the RTSP server configuration (defaults mirror wfb_rtsp).
struct RtspSnapshot
{
    int mtu = 1400;
    std::string uri = "/wfb";
    std::string rtsp_port = "8554";
    int rtp_port = 5600;
    int latency = 0;
    std::string codec = "h264";      // "h264" or "h265"
};

// The complete audit input: one pure-data snapshot.
struct AuditInput
{
    // Simulated command line for wfb_tx_cmd, without the program name, e.g.
    // {"8000", "set_fec", "-k", "8", "-n", "12"} or
    // {"-U", "wfb_tx_socket", "set_radio", "-B", "80"}.
    std::vector<std::string> argv;

    uint32_t request_req_id = 0;     // req_id that was placed into the request
    ResponseDesc response;           // optional response description
    RtspSnapshot rtsp;               // RTSP configuration snapshot
};

// One resolved parameter of a parsed control command.
struct ParamEntry
{
    std::string name;
    std::string value;               // rendered value (JSON-friendly)
    std::string source;              // "default" | "command_line" | "derived"
};

// Audit of the control-command part of the snapshot.
struct CommandAudit
{
    std::string target_kind;         // "udp_port" | "unix_socket" | ""
    std::string target;              // port string or abstract socket name
    bool recognized = false;         // subcommand is known to wfb_tx_cmd
    std::string name;                // subcommand name ("" if none given)
    int cmd_id = 0;                  // CMD_* value from tx_cmd.h, 0 if unknown
    bool executable = false;         // would wfb_tx_cmd accept and run it
    std::string reason;              // human-readable reason if not executable
    std::vector<ParamEntry> params;  // resolved parameters with value source
};

// Audit of the (optional) control response.
struct ResponseAudit
{
    bool applicable = false;         // a response was supplied and evaluable
    uint64_t expected_total_len = 0; // offsetof(cmd_resp_t, u) + payload size
    uint64_t actual_len = 0;
    bool ok = false;
    // "" | "length_too_short" | "req_id_mismatch" | "rc_nonzero" |
    // "length_inexact" | "inconsistent_snapshot"
    std::string failure_kind;
    std::string reason;              // human-readable explanation
};

// Audit of the RTSP configuration snapshot.
struct RtspAudit
{
    int mtu = 0;
    std::string uri;
    std::string rtsp_port;
    int rtp_port = 0;
    int latency = 0;
    std::string codec;
    int mode = 0;                    // 264 or 265 when derivable, else 0
    bool mode_derived = false;       // codec mapped cleanly to a mode
    bool valid = false;              // all RTSP checks passed
    std::string reason;              // human-readable reason if not valid
};

// One ordered check item of the audit report.
struct CheckItem
{
    std::string name;
    bool passed = false;
    std::string reason;              // human-readable reason when not passed
};

// The complete, JSON-serializable audit result (plain data only).
struct AuditResult
{
    CommandAudit command;
    ResponseAudit response;
    RtspAudit rtsp;
    std::vector<CheckItem> checks;   // ordered list of check items
    bool degraded = false;           // snapshot was self-contradictory
    std::string degraded_reason;     // human-readable degradation cause
};

// Run the audit. Pure: does not mutate input, does not perform I/O, does not
// throw on contradictory snapshots (returns a degraded result instead).
AuditResult audit(const AuditInput &input);

// Render an audit result as a JSON object string.
std::string to_json(const AuditResult &result);

} // namespace wfb_audit
