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

#include "wfb_audit.hpp"

#include <cstdlib>
#include <cstring>
#include <cstddef>
#include <cstdio>
#include <sstream>

// Included read-only, for the CMD_* command ids and the exact wire layout
// (offsetof / sizeof) of cmd_resp_t. This module never constructs or
// transmits these structs; only their compile-time geometry is used.
#include "tx_cmd.h"

namespace wfb_audit
{

namespace
{

const size_t RESP_HEADER_SIZE = offsetof(cmd_resp_t, u);
const size_t RESP_GET_FEC_PAYLOAD = sizeof(((cmd_resp_t *)0)->u.cmd_get_fec);
const size_t RESP_GET_RADIO_PAYLOAD = sizeof(((cmd_resp_t *)0)->u.cmd_get_radio);

int atoi_like(const std::string &s)
{
    return std::atoi(s.c_str());
}

std::string to_str(long long v)
{
    std::ostringstream oss;
    oss << v;
    return oss.str();
}

std::string bool_str(bool v)
{
    return v ? "true" : "false";
}

// Minimal getopt-style parser. optstring follows getopt conventions
// (e.g. "k:n:h"). Stops at the first non-option argument. Returns false and
// sets err on unknown options, missing arguments or -h (usage request).
bool parse_options(const std::vector<std::string> &args, const char *optstring,
                   std::vector<std::pair<char, std::string> > &out, std::string &err)
{
    for (size_t i = 0; i < args.size(); i++)
    {
        const std::string &a = args[i];
        if (a.size() < 2 || a[0] != '-') break; // first positional argument
        if (a == "--") break;

        char c = a[1];
        const char *spec = std::strchr(optstring, c);
        if (spec == NULL || c == 'h')
        {
            err = std::string("invalid option or usage requested: '-") + c + "'";
            return false;
        }

        bool has_arg = spec[1] == ':';
        std::string val;
        if (has_arg)
        {
            if (a.size() > 2)
            {
                val = a.substr(2);
            }
            else if (i + 1 < args.size())
            {
                val = args[++i];
            }
            else
            {
                err = std::string("option '-") + c + "' requires an argument";
                return false;
            }
        }
        out.push_back(std::make_pair(c, val));
    }
    return true;
}

void add_param(CommandAudit &cmd, const char *name, const std::string &value,
               const char *source)
{
    ParamEntry p;
    p.name = name;
    p.value = value;
    p.source = source;
    cmd.params.push_back(p);
}

void add_check(AuditResult &res, const char *name, bool passed,
               const std::string &reason)
{
    CheckItem item;
    item.name = name;
    item.passed = passed;
    item.reason = passed ? std::string() : reason;
    res.checks.push_back(item);
}

// htons() equivalent for a host-order value, computed without any socket
// headers: the 16-bit word as it appears on the wire, read in host order.
uint16_t to_network_order_u16(long long v)
{
    uint16_t x = (uint16_t)v;
    return (uint16_t)((x << 8) | (x >> 8));
}

// ---- per-subcommand parsers (mirror src/tx_cmd.c) ----

void audit_set_fec(const std::vector<std::string> &opts_args, AuditResult &res)
{
    CommandAudit &cmd = res.command;
    cmd.cmd_id = CMD_SET_FEC;

    std::vector<std::pair<char, std::string> > opts;
    std::string err;
    if (!parse_options(opts_args, "k:n:h", opts, err))
    {
        cmd.reason = err;
        add_check(res, "command.executable", false, err);
        return;
    }

    int k = 8, n = 12;
    std::string k_src = "default", n_src = "default";
    for (size_t i = 0; i < opts.size(); i++)
    {
        if (opts[i].first == 'k') { k = atoi_like(opts[i].second); k_src = "command_line"; }
        if (opts[i].first == 'n') { n = atoi_like(opts[i].second); n_src = "command_line"; }
    }

    add_param(cmd, "k", to_str(k), k_src.c_str());
    add_param(cmd, "n", to_str(n), n_src.c_str());

    bool k_ok = k >= 1 && k <= 255;
    bool n_ok = n >= 1 && n <= 255;
    bool kn_ok = k <= n;

    add_check(res, "set_fec.k_in_range_1_255", k_ok,
              "k=" + to_str(k) + " is outside 1..255");
    add_check(res, "set_fec.n_in_range_1_255", n_ok,
              "n=" + to_str(n) + " is outside 1..255");
    add_check(res, "set_fec.k_le_n", kn_ok,
              "k=" + to_str(k) + " exceeds n=" + to_str(n) +
              " (fec blocks k must not exceed total blocks n)");

    cmd.executable = k_ok && n_ok && kn_ok;
    if (!cmd.executable)
    {
        cmd.reason = "invalid FEC parameters: k=" + to_str(k) + ", n=" + to_str(n) +
                     " (require 1 <= k <= n <= 255)";
    }
}

void audit_set_radio(const std::vector<std::string> &opts_args, AuditResult &res)
{
    CommandAudit &cmd = res.command;
    cmd.cmd_id = CMD_SET_RADIO;

    std::vector<std::pair<char, std::string> > opts;
    std::string err;
    if (!parse_options(opts_args, "B:G:S:L:M:N:b:Vh", opts, err))
    {
        cmd.reason = err;
        add_check(res, "command.executable", false, err);
        return;
    }

    int bandwidth = 20, short_gi = 0, stbc = 0, ldpc = 0, mcs_index = 1,
        vht_nss = 1, subch = 0;
    bool vht_mode = false;
    std::string bw_src = "default", gi_src = "default", stbc_src = "default",
                ldpc_src = "default", mcs_src = "default", nss_src = "default",
                subch_src = "default", vht_src = "default";

    for (size_t i = 0; i < opts.size(); i++)
    {
        switch (opts[i].first)
        {
        case 'B':
            bandwidth = atoi_like(opts[i].second);
            bw_src = "command_line";
            // Force VHT mode for bandwidth >= 80 (mirrors set_radio())
            if (bandwidth >= 80)
            {
                vht_mode = true;
                vht_src = "derived";
            }
            break;
        case 'G':
            short_gi = (!opts[i].second.empty() &&
                        (opts[i].second[0] == 's' || opts[i].second[0] == 'S')) ? 1 : 0;
            gi_src = "command_line";
            break;
        case 'S': stbc = atoi_like(opts[i].second); stbc_src = "command_line"; break;
        case 'L': ldpc = atoi_like(opts[i].second); ldpc_src = "command_line"; break;
        case 'M': mcs_index = atoi_like(opts[i].second); mcs_src = "command_line"; break;
        case 'N': vht_nss = atoi_like(opts[i].second); nss_src = "command_line"; break;
        case 'b': subch = atoi_like(opts[i].second); subch_src = "command_line"; break;
        case 'V': vht_mode = true; vht_src = "command_line"; break;
        }
    }

    add_param(cmd, "bandwidth", to_str(bandwidth), bw_src.c_str());
    add_param(cmd, "short_gi", to_str(short_gi), gi_src.c_str());
    add_param(cmd, "stbc", to_str(stbc), stbc_src.c_str());
    add_param(cmd, "ldpc", to_str(ldpc), ldpc_src.c_str());
    add_param(cmd, "mcs_index", to_str(mcs_index), mcs_src.c_str());
    add_param(cmd, "vht_mode", bool_str(vht_mode), vht_src.c_str());
    add_param(cmd, "vht_nss", to_str(vht_nss), nss_src.c_str());
    add_param(cmd, "subch", to_str(subch), subch_src.c_str());

    bool vht_ok = bandwidth < 80 || vht_mode;
    add_check(res, "set_radio.vht_mode_forced_for_bandwidth_ge_80", vht_ok,
              "bandwidth=" + to_str(bandwidth) + " >= 80 requires vht_mode=true");

    cmd.executable = vht_ok;
    if (!cmd.executable)
    {
        cmd.reason = "bandwidth >= 80 requires VHT mode";
    }
}

void audit_set_fec_timeout(const std::vector<std::string> &opts_args, AuditResult &res)
{
    CommandAudit &cmd = res.command;
    cmd.cmd_id = CMD_SET_FEC_TIMEOUT;

    std::vector<std::pair<char, std::string> > opts;
    std::string err;
    if (!parse_options(opts_args, "T:h", opts, err))
    {
        cmd.reason = err;
        add_check(res, "command.executable", false, err);
        return;
    }

    int timeout_ms = 0; // 0: no timeout
    std::string t_src = "default";
    for (size_t i = 0; i < opts.size(); i++)
    {
        if (opts[i].first == 'T') { timeout_ms = atoi_like(opts[i].second); t_src = "command_line"; }
    }

    add_param(cmd, "timeout_ms", to_str(timeout_ms), t_src.c_str());
    add_param(cmd, "timeout_meaning",
              timeout_ms == 0 ? "no timeout" : "fec block timeout",
              "derived");

    bool t_ok = timeout_ms >= 0;
    add_check(res, "set_fec_timeout.timeout_nonnegative", t_ok,
              "timeout_ms=" + to_str(timeout_ms) + " is negative");

    cmd.executable = t_ok;
    if (!cmd.executable)
    {
        cmd.reason = "negative fec timeout";
    }
}

void audit_set_batch(const std::vector<std::string> &opts_args, AuditResult &res)
{
    CommandAudit &cmd = res.command;
    cmd.cmd_id = CMD_SET_BATCH;

    std::vector<std::pair<char, std::string> > opts;
    std::string err;
    if (!parse_options(opts_args, "m:T:h", opts, err))
    {
        cmd.reason = err;
        add_check(res, "command.executable", false, err);
        return;
    }

    int mtu = 1445, agg_timeout_ms = 5;
    std::string mtu_src = "default", agg_src = "default";
    for (size_t i = 0; i < opts.size(); i++)
    {
        if (opts[i].first == 'm') { mtu = atoi_like(opts[i].second); mtu_src = "command_line"; }
        if (opts[i].first == 'T') { agg_timeout_ms = atoi_like(opts[i].second); agg_src = "command_line"; }
    }

    add_param(cmd, "mtu", to_str(mtu), mtu_src.c_str());
    add_param(cmd, "agg_timeout_ms", to_str(agg_timeout_ms), agg_src.c_str());

    bool mtu_ok = mtu >= 0 && mtu <= 65535;
    bool agg_ok = agg_timeout_ms >= 0 && agg_timeout_ms <= 65535;

    // The wire fields are uint16_t in network order (htons in set_batch()).
    if (mtu_ok)
    {
        add_param(cmd, "mtu_network_order",
                  to_str(to_network_order_u16(mtu)), "derived");
    }
    if (agg_ok)
    {
        add_param(cmd, "agg_timeout_ms_network_order",
                  to_str(to_network_order_u16(agg_timeout_ms)), "derived");
    }

    add_check(res, "set_batch.mtu_fits_network_order_u16", mtu_ok,
              "mtu=" + to_str(mtu) + " cannot be represented as a network-order uint16");
    add_check(res, "set_batch.agg_timeout_fits_network_order_u16", agg_ok,
              "agg_timeout_ms=" + to_str(agg_timeout_ms) +
              " cannot be represented as a network-order uint16");

    cmd.executable = mtu_ok && agg_ok;
    if (!cmd.executable)
    {
        cmd.reason = "set_batch parameters out of uint16 range";
    }
}

PayloadKind payload_kind_for_cmd(int cmd_id, bool &known)
{
    known = true;
    switch (cmd_id)
    {
    case CMD_SET_FEC:
    case CMD_SET_RADIO:
    case CMD_SET_FEC_TIMEOUT:
    case CMD_SET_BATCH:
        return PayloadKind::NONE;
    case CMD_GET_FEC:
        return PayloadKind::GET_FEC;
    case CMD_GET_RADIO:
        return PayloadKind::GET_RADIO;
    default:
        known = false;
        return PayloadKind::NONE;
    }
}

size_t payload_size(PayloadKind kind)
{
    switch (kind)
    {
    case PayloadKind::GET_FEC: return RESP_GET_FEC_PAYLOAD;
    case PayloadKind::GET_RADIO: return RESP_GET_RADIO_PAYLOAD;
    default: return 0;
    }
}

const char *payload_kind_name(PayloadKind kind)
{
    switch (kind)
    {
    case PayloadKind::NONE: return "none";
    case PayloadKind::GET_FEC: return "get_fec";
    case PayloadKind::GET_RADIO: return "get_radio";
    }
    return "unknown";
}

void audit_command(const AuditInput &in, AuditResult &res)
{
    CommandAudit &cmd = res.command;
    const std::vector<std::string> &argv = in.argv;

    size_t idx = 0;
    if (idx < argv.size() && argv[idx] == "-U")
    {
        if (idx + 1 >= argv.size())
        {
            cmd.reason = "-U requires an abstract unix socket name";
            add_check(res, "command.recognized", false, cmd.reason);
            return;
        }
        cmd.target_kind = "unix_socket";
        cmd.target = argv[idx + 1];
        idx += 2;
    }
    else if (idx < argv.size())
    {
        cmd.target_kind = "udp_port";
        cmd.target = argv[idx];
        idx += 1;
    }

    if (idx >= argv.size())
    {
        cmd.reason = "no subcommand given";
        add_check(res, "command.recognized", false, cmd.reason);
        return;
    }

    cmd.name = argv[idx];
    std::vector<std::string> rest(argv.begin() + idx + 1, argv.end());

    if (cmd.name == "set_fec" || cmd.name == "set_radio" ||
        cmd.name == "set_fec_timeout" || cmd.name == "set_batch" ||
        cmd.name == "get_fec" || cmd.name == "get_radio")
    {
        cmd.recognized = true;
        add_check(res, "command.recognized", true, "");
    }
    else
    {
        cmd.recognized = false;
        cmd.executable = false;
        cmd.reason = "unknown subcommand: '" + cmd.name + "'";
        add_check(res, "command.recognized", false, cmd.reason);
        return;
    }

    if (cmd.name == "set_fec") audit_set_fec(rest, res);
    else if (cmd.name == "set_radio") audit_set_radio(rest, res);
    else if (cmd.name == "set_fec_timeout") audit_set_fec_timeout(rest, res);
    else if (cmd.name == "set_batch") audit_set_batch(rest, res);
    else // get_fec / get_radio: no parameters
    {
        cmd.cmd_id = (cmd.name == "get_fec") ? CMD_GET_FEC : CMD_GET_RADIO;
        cmd.executable = true;
    }
}

void audit_response(const AuditInput &in, AuditResult &res)
{
    ResponseAudit &ra = res.response;
    const ResponseDesc &resp = in.response;

    if (!resp.present) return;

    bool known = false;
    PayloadKind derived = payload_kind_for_cmd(res.command.cmd_id, known);

    if (!res.command.recognized || !known)
    {
        ra.applicable = false;
        ra.failure_kind = "inconsistent_snapshot";
        ra.reason = "response supplied but the request subcommand is unknown, "
                    "so the expected payload type cannot be derived";
        res.degraded = true;
        res.degraded_reason = ra.reason;
        add_check(res, "response.consistent", false, ra.reason);
        return;
    }

    ra.applicable = true;
    ra.actual_len = resp.actual_len;

    if (resp.expected_payload != derived)
    {
        ra.failure_kind = "inconsistent_snapshot";
        ra.reason = std::string("snapshot declares expected payload '") +
                    payload_kind_name(resp.expected_payload) + "' but cmd_id " +
                    to_str(res.command.cmd_id) + " implies '" +
                    payload_kind_name(derived) + "'";
        res.degraded = true;
        res.degraded_reason = ra.reason;
        add_check(res, "response.consistent", false, ra.reason);
        return;
    }

    ra.expected_total_len = (uint64_t)RESP_HEADER_SIZE + payload_size(derived);

    // Mirror the validation pipeline of send_command() in src/tx_cmd.c, with
    // each failure cause individually distinguishable.
    bool len_ok = resp.actual_len >= RESP_HEADER_SIZE;
    add_check(res, "response.length_sufficient", len_ok,
              "response of " + to_str((long long)resp.actual_len) +
              " bytes is shorter than the cmd_resp_t header (" +
              to_str((long long)RESP_HEADER_SIZE) + " bytes)");

    bool req_id_ok = false;
    if (len_ok)
    {
        req_id_ok = resp.req_id == in.request_req_id;
        add_check(res, "response.req_id_match", req_id_ok,
                  "response req_id=" + to_str((long long)resp.req_id) +
                  " does not match request req_id=" +
                  to_str((long long)in.request_req_id));
    }
    else
    {
        add_check(res, "response.req_id_match", false,
                  "not evaluable: response shorter than the header");
    }

    bool rc_ok = false;
    if (len_ok)
    {
        rc_ok = resp.rc == 0;
        add_check(res, "response.rc_zero", rc_ok,
                  "response rc=" + to_str((long long)resp.rc) + " (non-zero)");
    }
    else
    {
        add_check(res, "response.rc_zero", false,
                  "not evaluable: response shorter than the header");
    }

    bool exact_ok = resp.actual_len == ra.expected_total_len;
    add_check(res, "response.length_exact", exact_ok,
              "response of " + to_str((long long)resp.actual_len) +
              " bytes does not exactly match the expected " +
              to_str((long long)ra.expected_total_len) + " bytes");

    if (!len_ok)
    {
        ra.failure_kind = "length_too_short";
        ra.reason = "response shorter than offsetof(cmd_resp_t, u)";
    }
    else if (!req_id_ok)
    {
        ra.failure_kind = "req_id_mismatch";
        ra.reason = "response req_id does not match the request req_id";
    }
    else if (!rc_ok)
    {
        ra.failure_kind = "rc_nonzero";
        ra.reason = "response carries a non-zero return code";
    }
    else if (!exact_ok)
    {
        ra.failure_kind = "length_inexact";
        ra.reason = "response length does not exactly match the expected length";
    }

    ra.ok = len_ok && req_id_ok && rc_ok && exact_ok;
}

void audit_rtsp(const AuditInput &in, AuditResult &res)
{
    RtspAudit &ra = res.rtsp;
    const RtspSnapshot &snap = in.rtsp;

    ra.mtu = snap.mtu;
    ra.uri = snap.uri;
    ra.rtsp_port = snap.rtsp_port;
    ra.rtp_port = snap.rtp_port;
    ra.latency = snap.latency;
    ra.codec = snap.codec;

    bool uri_ok = !snap.uri.empty() && snap.uri[0] == '/';
    if (snap.uri.empty())
    {
        res.degraded = true;
        res.degraded_reason = "rtsp uri is empty";
    }
    add_check(res, "rtsp.uri_absolute", uri_ok,
              snap.uri.empty() ? "uri is empty"
                               : "uri '" + snap.uri + "' must start with '/'");

    bool codec_ok = snap.codec == "h264" || snap.codec == "h265";
    if (codec_ok)
    {
        // Mirrors mode = atoi(argv[optind] + 1) in wfb_rtsp.
        ra.mode = atoi_like(snap.codec.substr(1));
        ra.mode_derived = ra.mode > 0;
    }
    if (!codec_ok || !ra.mode_derived)
    {
        ra.mode = codec_ok ? ra.mode : 0;
        ra.mode_derived = false;
        res.degraded = true;
        res.degraded_reason = "cannot derive stream mode from codec '" +
                              snap.codec + "'";
    }
    add_check(res, "rtsp.codec_valid", codec_ok && ra.mode_derived,
              "codec '" + snap.codec + "' is not one of { h264, h265 }");

    bool mtu_ok = snap.mtu > 0;
    add_check(res, "rtsp.mtu_positive", mtu_ok,
              "mtu=" + to_str(snap.mtu) + " must be positive");

    bool rtp_port_ok = snap.rtp_port > 0;
    add_check(res, "rtsp.rtp_port_positive", rtp_port_ok,
              "rtp_port=" + to_str(snap.rtp_port) + " must be positive");

    bool latency_ok = snap.latency >= 0;
    add_check(res, "rtsp.latency_nonnegative", latency_ok,
              "latency=" + to_str(snap.latency) + " must not be negative");

    ra.valid = uri_ok && codec_ok && ra.mode_derived && mtu_ok && rtp_port_ok &&
               latency_ok;
    if (!ra.valid)
    {
        ra.reason = "one or more rtsp checks failed";
    }
}

std::string json_escape(const std::string &s)
{
    std::string out;
    out.reserve(s.size() + 2);
    for (size_t i = 0; i < s.size(); i++)
    {
        char c = s[i];
        switch (c)
        {
        case '"': out += "\\\""; break;
        case '\\': out += "\\\\"; break;
        case '\n': out += "\\n"; break;
        case '\r': out += "\\r"; break;
        case '\t': out += "\\t"; break;
        default:
            if ((unsigned char)c < 0x20)
            {
                char buf[8];
                std::snprintf(buf, sizeof(buf), "\\u%04x", (unsigned char)c);
                out += buf;
            }
            else
            {
                out += c;
            }
        }
    }
    return out;
}

std::string jstr(const std::string &s)
{
    return "\"" + json_escape(s) + "\"";
}

} // namespace

AuditResult audit(const AuditInput &input)
{
    AuditResult res;
    audit_command(input, res);
    audit_response(input, res);
    audit_rtsp(input, res);
    return res;
}

std::string to_json(const AuditResult &r)
{
    std::ostringstream o;
    o << "{\n  \"degraded\": " << (r.degraded ? "true" : "false")
      << ",\n  \"degraded_reason\": " << jstr(r.degraded_reason) << ",\n";

    o << "  \"command\": {\n"
      << "    \"target_kind\": " << jstr(r.command.target_kind) << ",\n"
      << "    \"target\": " << jstr(r.command.target) << ",\n"
      << "    \"recognized\": " << (r.command.recognized ? "true" : "false") << ",\n"
      << "    \"name\": " << jstr(r.command.name) << ",\n"
      << "    \"cmd_id\": " << r.command.cmd_id << ",\n"
      << "    \"executable\": " << (r.command.executable ? "true" : "false") << ",\n"
      << "    \"reason\": " << jstr(r.command.reason) << ",\n"
      << "    \"params\": [";
    for (size_t i = 0; i < r.command.params.size(); i++)
    {
        const ParamEntry &p = r.command.params[i];
        o << (i ? ", " : "") << "{\"name\": " << jstr(p.name)
          << ", \"value\": " << jstr(p.value)
          << ", \"source\": " << jstr(p.source) << "}";
    }
    o << "]\n  },\n";

    o << "  \"response\": {\n"
      << "    \"applicable\": " << (r.response.applicable ? "true" : "false") << ",\n"
      << "    \"expected_total_len\": " << r.response.expected_total_len << ",\n"
      << "    \"actual_len\": " << r.response.actual_len << ",\n"
      << "    \"ok\": " << (r.response.ok ? "true" : "false") << ",\n"
      << "    \"failure_kind\": " << jstr(r.response.failure_kind) << ",\n"
      << "    \"reason\": " << jstr(r.response.reason) << "\n  },\n";

    o << "  \"rtsp\": {\n"
      << "    \"mtu\": " << r.rtsp.mtu << ",\n"
      << "    \"uri\": " << jstr(r.rtsp.uri) << ",\n"
      << "    \"rtsp_port\": " << jstr(r.rtsp.rtsp_port) << ",\n"
      << "    \"rtp_port\": " << r.rtsp.rtp_port << ",\n"
      << "    \"latency\": " << r.rtsp.latency << ",\n"
      << "    \"codec\": " << jstr(r.rtsp.codec) << ",\n"
      << "    \"mode\": " << r.rtsp.mode << ",\n"
      << "    \"mode_derived\": " << (r.rtsp.mode_derived ? "true" : "false") << ",\n"
      << "    \"valid\": " << (r.rtsp.valid ? "true" : "false") << ",\n"
      << "    \"reason\": " << jstr(r.rtsp.reason) << "\n  },\n";

    o << "  \"checks\": [";
    for (size_t i = 0; i < r.checks.size(); i++)
    {
        const CheckItem &c = r.checks[i];
        o << (i ? ", " : "") << "{\"name\": " << jstr(c.name)
          << ", \"passed\": " << (c.passed ? "true" : "false")
          << ", \"reason\": " << jstr(c.reason) << "}";
    }
    o << "]\n}\n";
    return o.str();
}

} // namespace wfb_audit
