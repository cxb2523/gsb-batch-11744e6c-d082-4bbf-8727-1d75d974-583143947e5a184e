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

// Self-contained tests for the wfb_audit pure-function module. Uses only
// locally fabricated snapshots: no network interfaces, no key files, no
// sockets, no GStreamer runtime.
//
// Usage: wfb_audit_test           - run all tests, exit non-zero on failure
//        wfb_audit_test --json    - additionally print a sample JSON report

#include "wfb_audit.hpp"

#include <cstdio>
#include <cstring>
#include <string>

using namespace wfb_audit;

static int g_failures = 0;
static int g_checks = 0;

#define CHECK(cond)                                                        \
    do {                                                                   \
        ++g_checks;                                                        \
        if (!(cond)) {                                                     \
            ++g_failures;                                                  \
            std::printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond);    \
        }                                                                  \
    } while (0)

static const CheckItem *find_check(const AuditResult &r, const char *name)
{
    for (size_t i = 0; i < r.checks.size(); i++)
    {
        if (r.checks[i].name == name) return &r.checks[i];
    }
    return NULL;
}

static const ParamEntry *find_param(const AuditResult &r, const char *name)
{
    for (size_t i = 0; i < r.command.params.size(); i++)
    {
        if (r.command.params[i].name == name) return &r.command.params[i];
    }
    return NULL;
}

static bool all_checks_passed(const AuditResult &r)
{
    for (size_t i = 0; i < r.checks.size(); i++)
    {
        if (!r.checks[i].passed) return false;
    }
    return true;
}

// Field-by-field equality of the input snapshot (used to prove the audit
// does not mutate its input).
static bool input_equal(const AuditInput &a, const AuditInput &b)
{
    return a.argv == b.argv &&
           a.request_req_id == b.request_req_id &&
           a.response.present == b.response.present &&
           a.response.req_id == b.response.req_id &&
           a.response.rc == b.response.rc &&
           a.response.actual_len == b.response.actual_len &&
           a.response.expected_payload == b.response.expected_payload &&
           a.rtsp.mtu == b.rtsp.mtu &&
           a.rtsp.uri == b.rtsp.uri &&
           a.rtsp.rtsp_port == b.rtsp.rtsp_port &&
           a.rtsp.rtp_port == b.rtsp.rtp_port &&
           a.rtsp.latency == b.rtsp.latency &&
           a.rtsp.codec == b.rtsp.codec;
}

// ---- normal path ----

static void test_set_fec_normal()
{
    AuditInput in;
    in.argv = {"8000", "set_fec", "-k", "8", "-n", "12"};

    AuditResult r = audit(in);

    CHECK(r.command.recognized);
    CHECK(r.command.cmd_id == 1); // CMD_SET_FEC
    CHECK(r.command.executable);
    CHECK(r.command.target_kind == "udp_port");
    CHECK(r.command.target == "8000");

    const ParamEntry *k = find_param(r, "k");
    const ParamEntry *n = find_param(r, "n");
    CHECK(k && k->value == "8" && k->source == "command_line");
    CHECK(n && n->value == "12" && n->source == "command_line");

    CHECK(!r.checks.empty());
    CHECK(all_checks_passed(r));
    CHECK(!r.degraded);
}

static void test_set_radio_normal_vht_forced()
{
    AuditInput in;
    in.argv = {"-U", "wfb_tx_sock", "set_radio", "-B", "80"};

    AuditResult r = audit(in);

    CHECK(r.command.recognized);
    CHECK(r.command.cmd_id == 2); // CMD_SET_RADIO
    CHECK(r.command.executable);
    CHECK(r.command.target_kind == "unix_socket");
    CHECK(r.command.target == "wfb_tx_sock");

    const ParamEntry *bw = find_param(r, "bandwidth");
    const ParamEntry *vht = find_param(r, "vht_mode");
    CHECK(bw && bw->value == "80" && bw->source == "command_line");
    CHECK(vht && vht->value == "true" && vht->source == "derived");

    const CheckItem *c = find_check(r, "set_radio.vht_mode_forced_for_bandwidth_ge_80");
    CHECK(c && c->passed);

    CHECK(all_checks_passed(r));
    CHECK(!r.degraded);
}

static void test_set_fec_defaults()
{
    AuditInput in;
    in.argv = {"8000", "set_fec"};

    AuditResult r = audit(in);

    const ParamEntry *k = find_param(r, "k");
    const ParamEntry *n = find_param(r, "n");
    CHECK(k && k->value == "8" && k->source == "default");
    CHECK(n && n->value == "12" && n->source == "default");
    CHECK(r.command.executable);
    CHECK(all_checks_passed(r));
}

// ---- negative paths ----

static void test_set_fec_k_greater_than_n()
{
    AuditInput in;
    in.argv = {"8000", "set_fec", "-k", "13", "-n", "12"};

    AuditResult r = audit(in);

    CHECK(r.command.recognized);
    CHECK(!r.command.executable);
    CHECK(!r.command.reason.empty());

    const CheckItem *c = find_check(r, "set_fec.k_le_n");
    CHECK(c && !c->passed && !c->reason.empty());

    // k and n are individually within 1..255, only the k <= n rule fails
    const CheckItem *ck = find_check(r, "set_fec.k_in_range_1_255");
    const CheckItem *cn = find_check(r, "set_fec.n_in_range_1_255");
    CHECK(ck && ck->passed);
    CHECK(cn && cn->passed);
}

static void test_response_req_id_mismatch()
{
    AuditInput in;
    in.argv = {"8000", "set_fec", "-k", "8", "-n", "12"};
    in.request_req_id = 111;
    in.response.present = true;
    in.response.req_id = 222; // does not match the request
    in.response.rc = 0;
    in.response.actual_len = 8; // offsetof(cmd_resp_t, u)
    in.response.expected_payload = PayloadKind::NONE;

    AuditResult r = audit(in);

    CHECK(r.response.applicable);
    CHECK(!r.response.ok);
    CHECK(r.response.failure_kind == "req_id_mismatch");
    CHECK(!r.response.reason.empty());

    const CheckItem *c = find_check(r, "response.req_id_match");
    CHECK(c && !c->passed && !c->reason.empty());
}

static void test_response_failure_kinds_distinguishable()
{
    // length_too_short: fewer bytes than offsetof(cmd_resp_t, u)
    {
        AuditInput in;
        in.argv = {"8000", "get_fec"};
        in.request_req_id = 7;
        in.response.present = true;
        in.response.req_id = 7;
        in.response.rc = 0;
        in.response.actual_len = 5;
        in.response.expected_payload = PayloadKind::GET_FEC;

        AuditResult r = audit(in);
        CHECK(!r.response.ok);
        CHECK(r.response.failure_kind == "length_too_short");
        CHECK(find_check(r, "response.length_sufficient") &&
              !find_check(r, "response.length_sufficient")->passed);
    }

    // rc_nonzero
    {
        AuditInput in;
        in.argv = {"8000", "get_radio"};
        in.request_req_id = 7;
        in.response.present = true;
        in.response.req_id = 7;
        in.response.rc = 22; // EINVAL
        in.response.actual_len = 16; // 8 + sizeof(cmd_get_radio)
        in.response.expected_payload = PayloadKind::GET_RADIO;

        AuditResult r = audit(in);
        CHECK(!r.response.ok);
        CHECK(r.response.failure_kind == "rc_nonzero");
        CHECK(find_check(r, "response.rc_zero") &&
              !find_check(r, "response.rc_zero")->passed);
    }

    // length_inexact
    {
        AuditInput in;
        in.argv = {"8000", "get_fec"};
        in.request_req_id = 7;
        in.response.present = true;
        in.response.req_id = 7;
        in.response.rc = 0;
        in.response.actual_len = 11; // expected 8 + 2 = 10
        in.response.expected_payload = PayloadKind::GET_FEC;

        AuditResult r = audit(in);
        CHECK(!r.response.ok);
        CHECK(r.response.failure_kind == "length_inexact");
        CHECK(r.response.expected_total_len == 10);
        CHECK(find_check(r, "response.length_exact") &&
              !find_check(r, "response.length_exact")->passed);
    }

    // well-formed get_radio response passes all response checks
    {
        AuditInput in;
        in.argv = {"8000", "get_radio"};
        in.request_req_id = 7;
        in.response.present = true;
        in.response.req_id = 7;
        in.response.rc = 0;
        in.response.actual_len = 16;
        in.response.expected_payload = PayloadKind::GET_RADIO;

        AuditResult r = audit(in);
        CHECK(r.response.ok);
        CHECK(r.response.failure_kind.empty());
        CHECK(r.response.expected_total_len == 16);
        CHECK(all_checks_passed(r));
    }
}

static void test_unknown_subcommand()
{
    AuditInput in;
    in.argv = {"8000", "frobnicate", "-x"};

    AuditResult r = audit(in);

    CHECK(!r.command.recognized);
    CHECK(!r.command.executable);
    CHECK(!r.command.reason.empty());
    const CheckItem *c = find_check(r, "command.recognized");
    CHECK(c && !c->passed);
}

// ---- boundary paths ----

static void test_set_fec_timeout_default()
{
    AuditInput in;
    in.argv = {"8000", "set_fec_timeout"}; // no -T

    AuditResult r = audit(in);

    CHECK(r.command.executable);
    const ParamEntry *t = find_param(r, "timeout_ms");
    CHECK(t && t->value == "0" && t->source == "default");
    const ParamEntry *m = find_param(r, "timeout_meaning");
    CHECK(m && m->value == "no timeout");
    CHECK(all_checks_passed(r));
}

static void test_rtsp_h265_mode_derivation()
{
    AuditInput in;
    in.argv = {"8000", "set_fec"};
    in.rtsp.codec = "h265";

    AuditResult r = audit(in);

    CHECK(r.rtsp.valid);
    CHECK(r.rtsp.mode == 265);
    CHECK(r.rtsp.mode_derived);
    CHECK(all_checks_passed(r));
}

static void test_rtsp_defaults()
{
    AuditInput in;
    in.argv = {"8000", "set_fec"};

    AuditResult r = audit(in);

    CHECK(r.rtsp.mtu == 1400);
    CHECK(r.rtsp.uri == "/wfb");
    CHECK(r.rtsp.rtsp_port == "8554");
    CHECK(r.rtsp.rtp_port == 5600);
    CHECK(r.rtsp.latency == 0);
    CHECK(r.rtsp.codec == "h264");
    CHECK(r.rtsp.mode == 264);
    CHECK(r.rtsp.valid);
}

static void test_rtsp_invalid_values()
{
    // uri not starting with '/'
    {
        AuditInput in;
        in.argv = {"8000", "set_fec"};
        in.rtsp.uri = "wfb";
        AuditResult r = audit(in);
        CHECK(!r.rtsp.valid);
        CHECK(find_check(r, "rtsp.uri_absolute") &&
              !find_check(r, "rtsp.uri_absolute")->passed);
    }

    // negative mtu / rtp_port / latency
    {
        AuditInput in;
        in.argv = {"8000", "set_fec"};
        in.rtsp.mtu = 0;
        in.rtsp.rtp_port = -1;
        in.rtsp.latency = -5;
        AuditResult r = audit(in);
        CHECK(!r.rtsp.valid);
        CHECK(!find_check(r, "rtsp.mtu_positive")->passed);
        CHECK(!find_check(r, "rtsp.rtp_port_positive")->passed);
        CHECK(!find_check(r, "rtsp.latency_nonnegative")->passed);
    }
}

// ---- degraded (self-contradictory) snapshots ----

static void test_degraded_snapshots()
{
    // empty uri
    {
        AuditInput in;
        in.argv = {"8000", "set_fec"};
        in.rtsp.uri = "";
        AuditResult r = audit(in);
        CHECK(r.degraded);
        CHECK(!r.degraded_reason.empty());
        CHECK(!r.rtsp.valid);
        CHECK(find_check(r, "rtsp.uri_absolute") &&
              !find_check(r, "rtsp.uri_absolute")->passed);
    }

    // codec for which no mode can be derived
    {
        AuditInput in;
        in.argv = {"8000", "set_fec"};
        in.rtsp.codec = "vp9";
        AuditResult r = audit(in);
        CHECK(r.degraded);
        CHECK(!r.rtsp.mode_derived);
        CHECK(find_check(r, "rtsp.codec_valid") &&
              !find_check(r, "rtsp.codec_valid")->passed);
    }

    // response shorter than offsetof(cmd_resp_t, u)
    {
        AuditInput in;
        in.argv = {"8000", "get_fec"};
        in.request_req_id = 1;
        in.response.present = true;
        in.response.actual_len = 3;
        in.response.expected_payload = PayloadKind::GET_FEC;
        AuditResult r = audit(in);
        CHECK(!r.response.ok);
        CHECK(r.response.failure_kind == "length_too_short");
    }

    // declared payload kind contradicts the cmd_id
    {
        AuditInput in;
        in.argv = {"8000", "set_fec"};
        in.response.present = true;
        in.response.actual_len = 10;
        in.response.expected_payload = PayloadKind::GET_FEC; // set_fec -> NONE
        AuditResult r = audit(in);
        CHECK(r.degraded);
        CHECK(!r.degraded_reason.empty());
        CHECK(r.response.failure_kind == "inconsistent_snapshot");
    }
}

// ---- set_batch network-order checks ----

static void test_set_batch()
{
    // defaults: mtu=1445, agg_timeout_ms=5, both network-order encodable
    {
        AuditInput in;
        in.argv = {"-U", "wfb_tun_sock", "set_batch"};
        AuditResult r = audit(in);
        CHECK(r.command.executable);
        const ParamEntry *mtu = find_param(r, "mtu");
        const ParamEntry *agg = find_param(r, "agg_timeout_ms");
        CHECK(mtu && mtu->value == "1445" && mtu->source == "default");
        CHECK(agg && agg->value == "5" && agg->source == "default");
        const ParamEntry *mtu_no = find_param(r, "mtu_network_order");
        CHECK(mtu_no && mtu_no->source == "derived");
        CHECK(all_checks_passed(r));
    }

    // mtu exceeding uint16 cannot be represented in network order
    {
        AuditInput in;
        in.argv = {"-U", "wfb_tun_sock", "set_batch", "-m", "70000"};
        AuditResult r = audit(in);
        CHECK(!r.command.executable);
        CHECK(find_check(r, "set_batch.mtu_fits_network_order_u16") &&
              !find_check(r, "set_batch.mtu_fits_network_order_u16")->passed);
    }
}

// ---- JSON serializability and input immutability ----

static void test_json_and_immutability()
{
    AuditInput in;
    in.argv = {"8000", "set_fec", "-k", "8", "-n", "12"};
    in.request_req_id = 42;
    in.response.present = true;
    in.response.req_id = 42;
    in.response.rc = 0;
    in.response.actual_len = 8;
    in.response.expected_payload = PayloadKind::NONE;
    in.rtsp.codec = "h265";

    AuditInput before = in;
    AuditResult r = audit(in);

    // input snapshot unchanged, field by field
    CHECK(input_equal(before, in));

    // the result is JSON-serializable
    std::string j = to_json(r);
    CHECK(j.size() > 2);
    CHECK(j.front() == '{');
    CHECK(j.rfind('}') == j.size() - 2 || j.back() == '}');
    CHECK(j.find("\"name\": \"set_fec\"") != std::string::npos);
    CHECK(j.find("\"cmd_id\": 1") != std::string::npos);
    CHECK(j.find("\"mode\": 265") != std::string::npos);
    CHECK(j.find("\"checks\": [") != std::string::npos);
    // no unescaped control characters inside the document
    bool bad_ctrl = false;
    for (size_t i = 0; i < j.size(); i++)
    {
        unsigned char c = (unsigned char)j[i];
        if (c < 0x20 && c != '\n') bad_ctrl = true;
    }
    CHECK(!bad_ctrl);
}

int main(int argc, char **argv)
{
    test_set_fec_normal();
    test_set_radio_normal_vht_forced();
    test_set_fec_defaults();
    test_set_fec_k_greater_than_n();
    test_response_req_id_mismatch();
    test_response_failure_kinds_distinguishable();
    test_unknown_subcommand();
    test_set_fec_timeout_default();
    test_rtsp_h265_mode_derivation();
    test_rtsp_defaults();
    test_rtsp_invalid_values();
    test_degraded_snapshots();
    test_set_batch();
    test_json_and_immutability();

    if (argc > 1 && std::strcmp(argv[1], "--json") == 0)
    {
        AuditInput in;
        in.argv = {"8000", "set_radio", "-B", "80"};
        in.request_req_id = 42;
        in.response.present = true;
        in.response.req_id = 42;
        in.response.rc = 0;
        in.response.actual_len = 8;
        in.response.expected_payload = PayloadKind::NONE;
        in.rtsp.codec = "h265";
        std::printf("%s", to_json(audit(in)).c_str());
    }

    std::fprintf(stderr, "%d checks, %d failures\n", g_checks, g_failures);
    return g_failures == 0 ? 0 : 1;
}
