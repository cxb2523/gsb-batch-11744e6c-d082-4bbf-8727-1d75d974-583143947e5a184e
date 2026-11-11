import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RingBuffer } from '../src/store/ringBuffer.ts';
import { RateMeter } from '../src/store/rateMeter.ts';
import {
  matchesLogFilter,
  filterLogs,
  compileSafeRegex,
  highlightMatches,
} from '../src/features/console/logFilter.ts';
import {
  migrateControlConfig,
  migrateControls,
} from '../src/features/controls/controlsMigration.ts';
import {
  serializeWorkspaceProfile,
  parseWorkspaceProfile,
} from '../src/lib/workspace.ts';

describe('OpenSerial Studio v3.2 — UI Logic & Metrology Buffers', () => {
  it('RingBuffer maintains fixed capacity, preserves insertion order, and evicts oldest items', () => {
    const rb = new RingBuffer<string>(5);
    assert.equal(rb.length, 0);
    assert.deepEqual(rb.toArray(), []);

    // Fill partially
    rb.push('A');
    rb.push('B');
    rb.push('C');
    assert.equal(rb.length, 3);
    assert.deepEqual(rb.toArray(), ['A', 'B', 'C']);

    // Fill to capacity
    rb.push('D');
    rb.push('E');
    assert.equal(rb.length, 5);
    assert.deepEqual(rb.toArray(), ['A', 'B', 'C', 'D', 'E']);

    // Wrap-around eviction (FIFO)
    rb.push('F');
    rb.push('G');
    assert.equal(rb.length, 5);
    assert.deepEqual(rb.toArray(), ['C', 'D', 'E', 'F', 'G']);

    // Clear
    rb.clear();
    assert.equal(rb.length, 0);
    assert.deepEqual(rb.toArray(), []);
  });

  it('RateMeter calculates lines/s and bytes/s over a 1-second sliding window', () => {
    const meter = new RateMeter(1000);
    assert.deepEqual(meter.getRates(), { linesPerSec: 0, bytesPerSec: 0 });

    // Record sample bursts
    meter.record(10, 500);
    meter.record(20, 1000);

    const rates = meter.getRates();
    assert.equal(rates.linesPerSec, 30);
    assert.equal(rates.bytesPerSec, 1500);

    // After reset
    meter.reset();
    assert.deepEqual(meter.getRates(), { linesPerSec: 0, bytesPerSec: 0 });
  });

  it('LogFilter matches text, handles case sensitivity, regex, and invalid regex gracefully', () => {
    const rxItem = { text: '{"Signal_V": 3.1415, "Status": "OK"}', isTx: false };
    const txItem = { text: '> SET_PWM: 128', isTx: true };
    const mcpItem = { text: '[MCP TX] {"cmd":"read"}', isTx: true, isMcpTx: true };

    // 1. Text Search (case-insensitive default)
    assert.equal(
      matchesLogFilter(rxItem, { query: 'signal_v', isRegex: false, isCaseSensitive: false, stream: 'all' }),
      true
    );
    assert.equal(
      matchesLogFilter(rxItem, { query: 'signal_v', isRegex: false, isCaseSensitive: true, stream: 'all' }),
      false
    );

    // 2. Stream Filters
    assert.equal(
      matchesLogFilter(rxItem, { query: '', isRegex: false, isCaseSensitive: false, stream: 'rx' }),
      true
    );
    assert.equal(
      matchesLogFilter(rxItem, { query: '', isRegex: false, isCaseSensitive: false, stream: 'tx' }),
      false
    );
    assert.equal(
      matchesLogFilter(txItem, { query: '', isRegex: false, isCaseSensitive: false, stream: 'tx' }),
      true
    );
    assert.equal(
      matchesLogFilter(mcpItem, { query: '', isRegex: false, isCaseSensitive: false, stream: 'mcp' }),
      true
    );

    // 3. Regular Expression Search
    assert.equal(
      matchesLogFilter(rxItem, { query: 'Signal_[A-Z]', isRegex: true, isCaseSensitive: true, stream: 'all' }),
      true
    );

    // 4. Broken / Invalid Regex fallback
    const brokenPattern = '[unclosed-bracket';
    assert.equal(compileSafeRegex(brokenPattern, false), null);
    // Should safely fallback to substring match without throwing
    assert.equal(
      matchesLogFilter(rxItem, { query: brokenPattern, isRegex: true, isCaseSensitive: false, stream: 'all' }),
      false
    );

    // 5. Array filtering
    const all = [rxItem, txItem, mcpItem];
    const { filtered } = filterLogs(all, { query: 'SET_PWM', isRegex: false, isCaseSensitive: false, stream: 'all' });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].text, '> SET_PWM: 128');
  });

  it('HighlightMatches correctly partitions search matches for UI formatting', () => {
    const text = 'Sensor_A: 25.4, Sensor_B: 88.1';
    const segments = highlightMatches(text, 'Sensor', false, false);
    assert.equal(segments.length, 4);
    assert.equal(segments[0].isMatch, true);
    assert.equal(segments[0].text, 'Sensor');
    assert.equal(segments[1].isMatch, false);
    assert.equal(segments[1].text, '_A: 25.4, ');
    assert.equal(segments[2].isMatch, true);
    assert.equal(segments[2].text, 'Sensor');
    assert.equal(segments[3].isMatch, false);
    assert.equal(segments[3].text, '_B: 88.1');
  });

  it('Workspace profile persistence round-trips v3.2 activeTab and inspectorOpen settings', () => {
    const raw = serializeWorkspaceProfile(
      {
        baudRate: 2000000,
        bufferSize: 1024,
        controls: [
          {
            id: 'cam_rot_y',
            label: 'Camera Yaw',
            type: 'slider',
            group: 'Camera',
            pinTo: ['framebuffer'],
          },
        ],
        widgetPrefs: {
          GPU_FPS: 'line',
        },
        demoPreset: 'raymarcher_gpu',
        activeTab: 'framebuffer',
        inspectorOpen: true,
      },
      'v3.2 Test Profile'
    );

    const parsed = parseWorkspaceProfile(raw);
    assert.ok(parsed);
    assert.equal(parsed.version, '3.2');
    assert.equal(parsed.activeTab, 'framebuffer');
    assert.equal(parsed.inspectorOpen, true);
    assert.equal(parsed.controls.length, 1);
    assert.equal(parsed.controls[0].group, 'Camera');
    assert.deepEqual(parsed.controls[0].pinTo, ['framebuffer']);
  });

  it('Controls migration upgrades legacy v1/v2 profiles with group and pinTo attributes', () => {
    const legacy = [
      { id: 'LED_1', type: 'button' },
      { id: 'KP_GAIN', label: 'Proportional Gain', type: 'slider', min: 0, max: 50 },
      { id: 'LED_1', type: 'button' }, // duplicate id
      { id: 'SWITCH_1', type: 'toggle' },
      { id: 'TARGET_RPM', type: 'numeric', value: 1200 },
    ];

    const migrated = migrateControls(legacy);
    assert.equal(migrated.length, 4); // Deduplicated

    // 1. Button check
    assert.equal(migrated[0].id, 'LED_1');
    assert.equal(migrated[0].label, 'LED_1');
    assert.equal(migrated[0].group, 'General');
    assert.deepEqual(migrated[0].pinTo, ['controls']);

    // 2. Slider check
    assert.equal(migrated[1].id, 'KP_GAIN');
    assert.equal(migrated[1].label, 'Proportional Gain');
    assert.equal(migrated[1].min, 0);
    assert.equal(migrated[1].max, 50);
    assert.equal(migrated[1].step, 1);

    // 3. Toggle check
    assert.equal(migrated[2].type, 'toggle');
    assert.equal(migrated[2].value, false);

    // 4. Numeric check
    assert.equal(migrated[3].type, 'numeric');
    assert.equal(migrated[3].value, 1200);

    // Invalid item
    assert.equal(migrateControlConfig(null as any), null);
    assert.equal(migrateControlConfig({} as any), null);
  });
});
