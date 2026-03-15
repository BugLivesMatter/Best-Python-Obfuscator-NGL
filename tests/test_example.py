"""
Automated tests for example.py

Covers:
  MonitorWorker — init, state machine, Telegram, HTML parsing
  LZTMonitor    — config I/O, UI update helpers, autostart, log
"""
import sys
import os
import json
import unittest
from unittest.mock import MagicMock, patch, mock_open, call
from textwrap import dedent

# conftest.py already patched sys.modules; just import the target.
import example


# ═══════════════════════════════════════════════════════════════════════════════
# Shared helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _make_worker(config=None):
    """Create a MonitorWorker with all signals replaced by fresh MagicMocks."""
    cfg = config or {
        'telegram_bot_token': '',
        'telegram_chat_id': '',
        'check_interval': 60,
        'url': '',
        'headless': True,
        'itemID': 0,
    }
    w = example.MonitorWorker(cfg)
    for sig in ('update_log', 'update_status', 'new_item',
                'update_last_check', 'update_last_item', 'monitoring_stopped'):
        setattr(w, sig, MagicMock())
    return w


def _sample_item(**overrides):
    item = {
        'id':         '12345',
        'title':      'Test Account',
        'price':      '999',
        'link':       'https://lzt.market/item/12345',
        'seller':     'TestSeller',
        'time':       '5 minutes ago',
        'all_badges': ['Bronze', 'CS:GO (5)', 'Gold rank'],
        'statuses':   ['Verified', 'Top Seller'],
    }
    item.update(overrides)
    return item


def _make_html(items_html: str) -> str:
    return f'<div class="marketIndex--itemsContainer">{items_html}</div>'


def _item_html(
    item_id='12345',
    title='Test Account',
    title_href='item/12345',
    price='999',
    seller='TestSeller',
    time_text='5 minutes ago',
    statuses=('Verified', 'Top Seller'),
    badges=(('Bronze', None), ('CS:GO', '5')),
) -> str:
    status_spans = ''.join(f'<span class="stat">{s}</span>' for s in statuses)
    badge_divs = ''
    for name, count in badges:
        if count is not None:
            badge_divs += (
                f'<div class="marketIndexItem-Badge iconGameWithBadge"'
                f' data-cachedtitle="{name}">{count}</div>'
            )
        else:
            badge_divs += f'<div class="marketIndexItem-Badge">{name}</div>'

    return dedent(f"""
        <div class="marketIndexItem PopupItemLink" id="marketItem--{item_id}">
          <a class="marketIndexItem--Title" href="{title_href}">{title}</a>
          <span class="Value">{price}</span>
          <a class="username">{seller}</a>
          <span class="muted">{time_text}</span>
          <div class="marketIndexItem--Badges stats">{status_spans}</div>
          <div class="marketIndexItem--Badges">{badge_divs}</div>
        </div>
    """)


# ═══════════════════════════════════════════════════════════════════════════════
# MonitorWorker — initialisation
# ═══════════════════════════════════════════════════════════════════════════════

class TestMonitorWorkerInit(unittest.TestCase):

    def test_default_state_is_inactive(self):
        w = _make_worker()
        self.assertFalse(w.bot_active)

    def test_driver_is_none_on_init(self):
        w = _make_worker()
        self.assertIsNone(w.driver)

    def test_config_stored(self):
        cfg = {'telegram_bot_token': 'abc', 'check_interval': 30}
        w = _make_worker(cfg)
        self.assertIs(w.config, cfg)

    def test_monitor_event_is_threading_event(self):
        import threading
        w = _make_worker()
        self.assertIsInstance(w.monitor_event, threading.Event)


# ═══════════════════════════════════════════════════════════════════════════════
# MonitorWorker — start_monitoring / stop_monitoring
# ═══════════════════════════════════════════════════════════════════════════════

class TestMonitorWorkerStartStop(unittest.TestCase):

    def setUp(self):
        self.worker = _make_worker()

    def test_start_when_already_active_emits_log_and_returns(self):
        self.worker.bot_active = True
        self.worker.start_monitoring()
        self.worker.update_log.emit.assert_called_once()
        emitted = self.worker.update_log.emit.call_args[0][0]
        self.assertIn('запущен', emitted.lower())

    def test_start_when_already_active_does_not_create_driver(self):
        self.worker.bot_active = True
        self.worker.start_monitoring()
        self.assertIsNone(self.worker.driver)

    def test_stop_when_not_active_returns_immediately(self):
        self.worker.bot_active = False
        self.worker.stop_monitoring()
        self.worker.monitoring_stopped.emit.assert_not_called()

    def test_stop_when_active_sets_bot_active_false(self):
        self.worker.bot_active = True
        self.worker.stop_monitoring()
        self.assertFalse(self.worker.bot_active)

    def test_stop_quits_driver_if_present(self):
        self.worker.bot_active = True
        mock_driver = MagicMock()
        self.worker.driver = mock_driver
        self.worker.stop_monitoring()
        mock_driver.quit.assert_called_once()

    def test_stop_sets_driver_to_none(self):
        self.worker.bot_active = True
        self.worker.driver = MagicMock()
        self.worker.stop_monitoring()
        self.assertIsNone(self.worker.driver)

    def test_stop_emits_monitoring_stopped(self):
        self.worker.bot_active = True
        self.worker.stop_monitoring()
        self.worker.monitoring_stopped.emit.assert_called_once()

    def test_stop_survives_driver_quit_exception(self):
        self.worker.bot_active = True
        bad_driver = MagicMock()
        bad_driver.quit.side_effect = RuntimeError("browser gone")
        self.worker.driver = bad_driver
        self.worker.stop_monitoring()               # must not raise
        self.worker.monitoring_stopped.emit.assert_called_once()


# ═══════════════════════════════════════════════════════════════════════════════
# MonitorWorker — format_telegram_message
# ═══════════════════════════════════════════════════════════════════════════════

class TestFormatTelegramMessage(unittest.TestCase):

    def setUp(self):
        self.worker = _make_worker()

    def _format(self, **item_overrides):
        return self.worker.format_telegram_message(_sample_item(**item_overrides))

    def test_contains_title(self):
        msg = self._format(title='Super Account')
        self.assertIn('Super Account', msg)

    def test_contains_price(self):
        msg = self._format(price='1234')
        self.assertIn('1234', msg)

    def test_contains_seller(self):
        msg = self._format(seller='BestSeller')
        self.assertIn('BestSeller', msg)

    def test_contains_time(self):
        msg = self._format(time='2 hours ago')
        self.assertIn('2 hours ago', msg)

    def test_badges_listed(self):
        msg = self._format(all_badges=['Badge A', 'Badge B'])
        self.assertIn('Badge A', msg)
        self.assertIn('Badge B', msg)

    def test_statuses_listed(self):
        msg = self._format(statuses=['Status X'])
        self.assertIn('Status X', msg)

    def test_empty_badges_shows_placeholder(self):
        msg = self._format(all_badges=[])
        self.assertIn('Характеристики не указаны', msg)

    def test_empty_statuses_shows_placeholder(self):
        msg = self._format(statuses=[])
        self.assertIn('Нет статусов', msg)

    def test_badges_missing_key_shows_placeholder(self):
        item = _sample_item()
        del item['all_badges']
        msg = self.worker.format_telegram_message(item)
        self.assertIn('Характеристики не указаны', msg)

    def test_output_is_html(self):
        msg = self._format()
        self.assertIn('<b>', msg)

    def test_lzt_header_present(self):
        msg = self._format()
        self.assertIn('LZT.MARKET', msg)


# ═══════════════════════════════════════════════════════════════════════════════
# MonitorWorker — send_telegram_message
# ═══════════════════════════════════════════════════════════════════════════════

class TestSendTelegramMessage(unittest.TestCase):

    def setUp(self):
        self.worker = _make_worker({
            'telegram_bot_token': 'TOKEN123',
            'telegram_chat_id':   'CHAT456',
        })

    def _send(self, chat_id='CHAT', message='Hi', reply_markup=None, **cfg):
        cfg.setdefault('telegram_bot_token', 'TOKEN123')
        cfg.setdefault('telegram_chat_id', 'CHAT456')
        self.worker.config = cfg
        return self.worker.send_telegram_message(chat_id, message, reply_markup)

    # ── credentials missing ───────────────────────────────────────────────────

    def test_missing_token_returns_false(self):
        self.worker.config['telegram_bot_token'] = ''
        result = self.worker.send_telegram_message('chat', 'msg')
        self.assertFalse(result)

    def test_missing_token_emits_log(self):
        self.worker.config['telegram_bot_token'] = ''
        self.worker.send_telegram_message('chat', 'msg')
        self.worker.update_log.emit.assert_called_once()

    def test_missing_chat_id_returns_false(self):
        result = self.worker.send_telegram_message('', 'msg')
        self.assertFalse(result)

    # ── successful send ───────────────────────────────────────────────────────

    def test_success_returns_true(self):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        with patch.object(example.requests, 'post', return_value=mock_resp):
            result = self.worker.send_telegram_message('chat', 'msg')
        self.assertTrue(result)

    def test_success_emits_confirmation_log(self):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        with patch.object(example.requests, 'post', return_value=mock_resp):
            self.worker.send_telegram_message('chat', 'msg')
        self.worker.update_log.emit.assert_called_once()
        log_text = self.worker.update_log.emit.call_args[0][0]
        self.assertIn('отправлен', log_text.lower())

    def test_correct_api_url_called(self):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        self.worker.config['telegram_bot_token'] = 'MYTOKEN'
        with patch.object(example.requests, 'post', return_value=mock_resp) as mock_post:
            self.worker.send_telegram_message('chat', 'msg')
        url = mock_post.call_args[0][0]
        self.assertIn('MYTOKEN', url)
        self.assertIn('sendMessage', url)

    def test_reply_markup_serialised_to_json(self):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        markup = {'inline_keyboard': [[{'text': 'Go', 'url': 'http://x'}]]}
        with patch.object(example.requests, 'post', return_value=mock_resp) as mock_post:
            self.worker.send_telegram_message('chat', 'msg', markup)
        payload = mock_post.call_args[1]['json']
        self.assertEqual(payload['reply_markup'], json.dumps(markup))

    # ── failure paths ─────────────────────────────────────────────────────────

    def test_http_error_returns_false(self):
        mock_resp = MagicMock()
        mock_resp.raise_for_status.side_effect = Exception('HTTP 400')
        with patch.object(example.requests, 'post', return_value=mock_resp):
            result = self.worker.send_telegram_message('chat', 'msg')
        self.assertFalse(result)

    def test_http_error_emits_error_log(self):
        mock_resp = MagicMock()
        mock_resp.raise_for_status.side_effect = Exception('HTTP 400')
        with patch.object(example.requests, 'post', return_value=mock_resp):
            self.worker.send_telegram_message('chat', 'msg')
        log_text = self.worker.update_log.emit.call_args[0][0]
        self.assertIn('Ошибка', log_text)

    def test_connection_error_returns_false(self):
        with patch.object(example.requests, 'post', side_effect=ConnectionError('no net')):
            result = self.worker.send_telegram_message('chat', 'msg')
        self.assertFalse(result)

    def test_connection_error_emits_log(self):
        with patch.object(example.requests, 'post', side_effect=ConnectionError('no net')):
            self.worker.send_telegram_message('chat', 'msg')
        self.worker.update_log.emit.assert_called_once()


# ═══════════════════════════════════════════════════════════════════════════════
# MonitorWorker — parse_second_item
# ═══════════════════════════════════════════════════════════════════════════════

class TestParseSecondItem(unittest.TestCase):

    def setUp(self):
        self.worker = _make_worker()

    def _parse(self, html, itemid=0):
        return self.worker.parse_second_item(html, itemid)

    # ── guard clauses ─────────────────────────────────────────────────────────

    def test_none_html_returns_none(self):
        self.assertIsNone(self._parse(None))

    def test_empty_string_returns_none(self):
        self.assertIsNone(self._parse(''))

    def test_no_container_returns_none(self):
        html = '<div class="other"><div class="marketIndexItem PopupItemLink" id="marketItem--1">x</div></div>'
        self.assertIsNone(self._parse(html))

    def test_no_container_emits_log(self):
        self._parse('<div>no container</div>')
        self.worker.update_log.emit.assert_called()

    def test_empty_container_returns_none(self):
        html = _make_html('')
        self.assertIsNone(self._parse(html, itemid=0))

    def test_itemid_out_of_range_returns_none(self):
        html = _make_html(_item_html())     # 1 item
        self.assertIsNone(self._parse(html, itemid=1))

    def test_itemid_out_of_range_emits_log(self):
        html = _make_html(_item_html())
        self._parse(html, itemid=1)
        self.worker.update_log.emit.assert_called()

    def test_item_without_id_returns_none(self):
        html = _make_html(
            '<div class="marketIndexItem PopupItemLink">'
            '<a class="marketIndexItem--Title">T</a>'
            '</div>'
        )
        self.assertIsNone(self._parse(html))

    def test_item_with_only_prefix_id_returns_none(self):
        html = _make_html(
            '<div class="marketIndexItem PopupItemLink" id="marketItem--">'
            '<a class="marketIndexItem--Title">T</a>'
            '</div>'
        )
        self.assertIsNone(self._parse(html))

    # ── happy path ────────────────────────────────────────────────────────────

    def test_returns_dict(self):
        html = _make_html(_item_html())
        result = self._parse(html)
        self.assertIsInstance(result, dict)

    def test_correct_id(self):
        html = _make_html(_item_html(item_id='99999'))
        result = self._parse(html)
        self.assertEqual(result['id'], '99999')

    def test_correct_title(self):
        html = _make_html(_item_html(title='Premium Account'))
        result = self._parse(html)
        self.assertEqual(result['title'], 'Premium Account')

    def test_correct_price(self):
        html = _make_html(_item_html(price='4999'))
        result = self._parse(html)
        self.assertEqual(result['price'], '4999')

    def test_correct_seller(self):
        html = _make_html(_item_html(seller='FastSeller'))
        result = self._parse(html)
        self.assertEqual(result['seller'], 'FastSeller')

    def test_correct_time(self):
        html = _make_html(_item_html(time_text='just now'))
        result = self._parse(html)
        self.assertEqual(result['time'], 'just now')

    def test_link_constructed_from_href(self):
        html = _make_html(_item_html(title_href='accounts/9'))
        result = self._parse(html)
        self.assertEqual(result['link'], 'https://lzt.market/accounts/9')

    def test_statuses_parsed(self):
        html = _make_html(_item_html(statuses=('Verified', 'Trusted')))
        result = self._parse(html)
        self.assertEqual(result['statuses'], ['Verified', 'Trusted'])

    def test_plain_badge_parsed(self):
        html = _make_html(_item_html(badges=[('Bronze', None)]))
        result = self._parse(html)
        self.assertIn('Bronze', result['all_badges'])

    def test_game_badge_with_count_parsed(self):
        html = _make_html(_item_html(badges=[('CS:GO', '5')]))
        result = self._parse(html)
        self.assertIn('CS:GO (5)', result['all_badges'])

    def test_game_badge_without_count_parsed(self):
        html = _make_html(_item_html(badges=[('Dota 2', '')]))
        result = self._parse(html)
        self.assertIn('Dota 2', result['all_badges'])

    def test_no_title_elem_returns_default(self):
        html = _make_html(
            '<div class="marketIndexItem PopupItemLink" id="marketItem--42">'
            '<span class="Value">100</span>'
            '</div>'
        )
        result = self._parse(html)
        self.assertEqual(result['title'], 'Без названия')

    def test_no_price_elem_returns_default(self):
        html = _make_html(
            '<div class="marketIndexItem PopupItemLink" id="marketItem--42">'
            '<a class="marketIndexItem--Title" href="x">T</a>'
            '</div>'
        )
        result = self._parse(html)
        self.assertEqual(result['price'], 'Цена не указана')

    def test_no_seller_elem_returns_default(self):
        html = _make_html(
            '<div class="marketIndexItem PopupItemLink" id="marketItem--42">'
            '<a class="marketIndexItem--Title" href="x">T</a>'
            '</div>'
        )
        result = self._parse(html)
        self.assertEqual(result['seller'], 'Продавец не указан')

    def test_second_item_selected_by_index(self):
        two_items = _item_html(item_id='1', title='First') + _item_html(item_id='2', title='Second')
        html = _make_html(two_items)
        result = self._parse(html, itemid=1)
        self.assertEqual(result['id'], '2')
        self.assertEqual(result['title'], 'Second')

    def test_required_keys_present(self):
        html = _make_html(_item_html())
        result = self._parse(html)
        for key in ('id', 'title', 'price', 'link', 'seller', 'time', 'all_badges', 'statuses'):
            self.assertIn(key, result, f"Key '{key}' missing from result")


# ═══════════════════════════════════════════════════════════════════════════════
# MonitorWorker — send_telegram_notification
# ═══════════════════════════════════════════════════════════════════════════════

class TestSendTelegramNotification(unittest.TestCase):

    def setUp(self):
        self.worker = _make_worker({'telegram_chat_id': 'CHAT', 'telegram_bot_token': 'T'})

    def test_calls_send_telegram_message(self):
        item = _sample_item(link='https://lzt.market/item/1')
        with patch.object(self.worker, 'send_telegram_message') as mock_send:
            self.worker.send_telegram_notification(item)
        mock_send.assert_called_once()

    def test_passes_chat_id_from_config(self):
        self.worker.config['telegram_chat_id'] = 'MY_CHAT'
        item = _sample_item()
        with patch.object(self.worker, 'send_telegram_message') as mock_send:
            self.worker.send_telegram_notification(item)
        chat_id = mock_send.call_args[0][0]
        self.assertEqual(chat_id, 'MY_CHAT')

    def test_keyboard_contains_item_link(self):
        item = _sample_item(link='https://lzt.market/item/99')
        with patch.object(self.worker, 'send_telegram_message') as mock_send:
            self.worker.send_telegram_notification(item)
        keyboard = mock_send.call_args[0][2]
        url = keyboard['inline_keyboard'][0][0]['url']
        self.assertEqual(url, 'https://lzt.market/item/99')


# ═══════════════════════════════════════════════════════════════════════════════
# LZTMonitor — load_config (tested via unbound call with mock self)
# ═══════════════════════════════════════════════════════════════════════════════

class TestLZTMonitorLoadConfig(unittest.TestCase):

    def _load(self, mock_self=None):
        return example.LZTMonitor.load_config(mock_self or MagicMock())

    def test_no_config_file_returns_default_copy(self):
        with patch.object(example.os.path, 'exists', return_value=False):
            result = self._load()
        self.assertEqual(result, example.DEFAULT_CONFIG)

    def test_no_config_file_returns_copy_not_original(self):
        with patch.object(example.os.path, 'exists', return_value=False):
            result = self._load()
        self.assertIsNot(result, example.DEFAULT_CONFIG)

    def test_valid_json_file_returns_loaded_config(self):
        cfg = {'telegram_bot_token': 'abc', 'itemID': 5}
        with patch.object(example.os.path, 'exists', return_value=True), \
             patch('builtins.open', mock_open(read_data=json.dumps(cfg))):
            result = self._load()
        self.assertEqual(result, cfg)

    def test_invalid_json_returns_default(self):
        with patch.object(example.os.path, 'exists', return_value=True), \
             patch('builtins.open', mock_open(read_data='{ INVALID JSON ][')):
            result = self._load()
        self.assertEqual(result, example.DEFAULT_CONFIG)

    def test_invalid_json_calls_update_log(self):
        mock_self = MagicMock()
        with patch.object(example.os.path, 'exists', return_value=True), \
             patch('builtins.open', mock_open(read_data='bad')):
            self._load(mock_self)
        mock_self.update_log.assert_called_once()

    def test_opens_correct_config_file(self):
        with patch.object(example.os.path, 'exists', return_value=True), \
             patch('builtins.open', mock_open(read_data='{}')) as m:
            self._load()
        m.assert_called_once_with(example.CONFIG_FILE, 'r', encoding='utf-8')


# ═══════════════════════════════════════════════════════════════════════════════
# LZTMonitor — save_config
# ═══════════════════════════════════════════════════════════════════════════════

class TestLZTMonitorSaveConfig(unittest.TestCase):

    def test_writes_to_config_file(self):
        mock_self = MagicMock()
        mock_self.config = {'key': 'val'}
        with patch('builtins.open', mock_open()) as m:
            example.LZTMonitor.save_config(mock_self)
        m.assert_called_once_with(example.CONFIG_FILE, 'w', encoding='utf-8')

    def test_json_written_matches_config(self):
        mock_self = MagicMock()
        mock_self.config = {'a': 1, 'b': 'hello'}
        written = []
        with patch('builtins.open', mock_open()) as m:
            m().write.side_effect = written.append
            example.LZTMonitor.save_config(mock_self)
        content = ''.join(written)
        self.assertEqual(json.loads(content), mock_self.config)

    def test_calls_update_log(self):
        mock_self = MagicMock()
        mock_self.config = {}
        with patch('builtins.open', mock_open()):
            example.LZTMonitor.save_config(mock_self)
        mock_self.update_log.assert_called_once()


# ═══════════════════════════════════════════════════════════════════════════════
# LZTMonitor — update_log
# ═══════════════════════════════════════════════════════════════════════════════

class TestLZTMonitorUpdateLog(unittest.TestCase):

    def test_appends_to_log_area(self):
        mock_self = MagicMock()
        example.LZTMonitor.update_log(mock_self, 'Hello World')
        mock_self.log_area.append.assert_called_once()

    def test_appended_text_contains_message(self):
        mock_self = MagicMock()
        example.LZTMonitor.update_log(mock_self, 'Test message')
        appended = mock_self.log_area.append.call_args[0][0]
        self.assertIn('Test message', appended)

    def test_appended_text_contains_timestamp(self):
        mock_self = MagicMock()
        example.LZTMonitor.update_log(mock_self, 'x')
        appended = mock_self.log_area.append.call_args[0][0]
        # Timestamp format is [HH:MM:SS]
        self.assertRegex(appended, r'\[\d{2}:\d{2}:\d{2}\]')

    def test_scrollbar_moved_to_bottom(self):
        mock_self = MagicMock()
        example.LZTMonitor.update_log(mock_self, 'msg')
        mock_self.log_area.verticalScrollBar().setValue.assert_called_once()


# ═══════════════════════════════════════════════════════════════════════════════
# LZTMonitor — update_status
# ═══════════════════════════════════════════════════════════════════════════════

class TestLZTMonitorUpdateStatus(unittest.TestCase):

    def test_sets_text_on_status_label(self):
        mock_self = MagicMock()
        example.LZTMonitor.update_status(mock_self, 'Running')
        mock_self.status_label.setText.assert_called_once_with('Running')


# ═══════════════════════════════════════════════════════════════════════════════
# LZTMonitor — handle_new_item
# ═══════════════════════════════════════════════════════════════════════════════

class TestLZTMonitorHandleNewItem(unittest.TestCase):

    def setUp(self):
        self.mock_self = MagicMock()

    def _handle(self, **item_overrides):
        item = _sample_item(**item_overrides)
        example.LZTMonitor.handle_new_item(self.mock_self, item)
        return item

    def test_updates_latest_item(self):
        item = self._handle()
        self.assertIs(self.mock_self.latest_item, item)

    def test_updates_last_item_label_with_id(self):
        self._handle(id='77777')
        label_text = self.mock_self.last_item_label.setText.call_args[0][0]
        self.assertIn('77777', label_text)

    def test_sets_item_info_html(self):
        self._handle()
        self.mock_self.item_info.setHtml.assert_called_once()

    def test_html_contains_id(self):
        self._handle(id='42')
        html = self.mock_self.item_info.setHtml.call_args[0][0]
        self.assertIn('42', html)

    def test_html_contains_title(self):
        self._handle(title='Elite Account')
        html = self.mock_self.item_info.setHtml.call_args[0][0]
        self.assertIn('Elite Account', html)

    def test_html_contains_price(self):
        self._handle(price='5555')
        html = self.mock_self.item_info.setHtml.call_args[0][0]
        self.assertIn('5555', html)

    def test_html_contains_badges(self):
        self._handle(all_badges=['Gold Badge'])
        html = self.mock_self.item_info.setHtml.call_args[0][0]
        self.assertIn('Gold Badge', html)

    def test_html_contains_statuses(self):
        self._handle(statuses=['Trusted'])
        html = self.mock_self.item_info.setHtml.call_args[0][0]
        self.assertIn('Trusted', html)


# ═══════════════════════════════════════════════════════════════════════════════
# LZTMonitor — save_settings
# ═══════════════════════════════════════════════════════════════════════════════

class TestLZTMonitorSaveSettings(unittest.TestCase):

    def _make_mock_self(self, url='http://x', item_id=3, interval=30,
                        token='T', chat='C', headless=True, autostart=False):
        mock_self = MagicMock()
        mock_self.config = {}
        mock_self.url_edit.text.return_value               = url
        mock_self.item_id_spin.value.return_value          = item_id
        mock_self.interval_spin.value.return_value         = interval
        mock_self.telegram_token_edit.text.return_value    = token
        mock_self.telegram_chat_edit.text.return_value     = chat
        mock_self.headless_check.isChecked.return_value    = headless
        mock_self.autostart_check.isChecked.return_value   = autostart
        mock_self.monitor_worker = None
        return mock_self

    def test_url_read_from_ui(self):
        ms = self._make_mock_self(url='https://lzt.market/steam')
        with patch.object(example.LZTMonitor, 'save_config'), \
             patch.object(example.LZTMonitor, 'update_autostart'), \
             patch.object(example.LZTMonitor, 'update_log'):
            example.LZTMonitor.save_settings(ms)
        self.assertEqual(ms.config['url'], 'https://lzt.market/steam')

    def test_item_id_read_from_spinbox(self):
        ms = self._make_mock_self(item_id=7)
        with patch.object(example.LZTMonitor, 'save_config'), \
             patch.object(example.LZTMonitor, 'update_autostart'), \
             patch.object(example.LZTMonitor, 'update_log'):
            example.LZTMonitor.save_settings(ms)
        self.assertEqual(ms.config['itemID'], 7)

    def test_interval_read_from_spinbox(self):
        ms = self._make_mock_self(interval=120)
        with patch.object(example.LZTMonitor, 'save_config'), \
             patch.object(example.LZTMonitor, 'update_autostart'), \
             patch.object(example.LZTMonitor, 'update_log'):
            example.LZTMonitor.save_settings(ms)
        self.assertEqual(ms.config['check_interval'], 120)

    def test_headless_checkbox_read(self):
        ms = self._make_mock_self(headless=False)
        with patch.object(example.LZTMonitor, 'save_config'), \
             patch.object(example.LZTMonitor, 'update_autostart'), \
             patch.object(example.LZTMonitor, 'update_log'):
            example.LZTMonitor.save_settings(ms)
        self.assertFalse(ms.config['headless'])

    def test_save_config_called(self):
        ms = self._make_mock_self()
        example.LZTMonitor.save_settings(ms)
        ms.save_config.assert_called_once()

    def test_update_autostart_called(self):
        ms = self._make_mock_self()
        example.LZTMonitor.save_settings(ms)
        ms.update_autostart.assert_called_once()


# ═══════════════════════════════════════════════════════════════════════════════
# LZTMonitor — reset_settings
# ═══════════════════════════════════════════════════════════════════════════════

class TestLZTMonitorResetSettings(unittest.TestCase):

    def test_config_reset_to_default(self):
        mock_self = MagicMock()
        mock_self.config = {'url': 'custom', 'itemID': 99}
        with patch.object(example.LZTMonitor, 'load_config_to_ui'), \
             patch.object(example.LZTMonitor, 'save_config'):
            example.LZTMonitor.reset_settings(mock_self)
        self.assertEqual(mock_self.config, example.DEFAULT_CONFIG)

    def test_load_config_to_ui_called(self):
        mock_self = MagicMock()
        mock_self.config = {}
        example.LZTMonitor.reset_settings(mock_self)
        mock_self.load_config_to_ui.assert_called_once()

    def test_save_config_called(self):
        mock_self = MagicMock()
        mock_self.config = {}
        example.LZTMonitor.reset_settings(mock_self)
        mock_self.save_config.assert_called_once()


# ═══════════════════════════════════════════════════════════════════════════════
# LZTMonitor — update_autostart
# ═══════════════════════════════════════════════════════════════════════════════

class TestLZTMonitorUpdateAutostart(unittest.TestCase):

    def setUp(self):
        example.winreg.reset_mock()
        self.mock_key = MagicMock()
        example.winreg.OpenKey.return_value = self.mock_key

    def _run(self, autostart: bool):
        mock_self = MagicMock()
        mock_self.config = {'autostart': autostart}
        example.LZTMonitor.update_autostart(mock_self)
        return mock_self

    def test_autostart_enabled_calls_SetValueEx(self):
        self._run(True)
        example.winreg.SetValueEx.assert_called_once()

    def test_autostart_enabled_key_contains_app_name(self):
        self._run(True)
        args = example.winreg.SetValueEx.call_args[0]
        self.assertEqual(args[1], 'LZTMarketMonitor')

    def test_autostart_disabled_calls_DeleteValue(self):
        self._run(False)
        example.winreg.DeleteValue.assert_called_once()

    def test_autostart_key_closed_after_use(self):
        self._run(True)
        example.winreg.CloseKey.assert_called_once_with(self.mock_key)

    def test_log_message_contains_enabled(self):
        mock_self = self._run(True)
        mock_self.update_log.assert_called_once()
        self.assertIn('включен', mock_self.update_log.call_args[0][0])

    def test_log_message_contains_disabled(self):
        mock_self = self._run(False)
        mock_self.update_log.assert_called_once()
        self.assertIn('отключен', mock_self.update_log.call_args[0][0])

    def test_registry_error_logs_error(self):
        example.winreg.OpenKey.side_effect = PermissionError('Access denied')
        mock_self = MagicMock()
        mock_self.config = {'autostart': True}
        example.LZTMonitor.update_autostart(mock_self)
        mock_self.update_log.assert_called_once()
        self.assertIn('Ошибка', mock_self.update_log.call_args[0][0])

    def test_delete_value_not_found_is_silenced(self):
        example.winreg.DeleteValue.side_effect = FileNotFoundError
        mock_self = MagicMock()
        mock_self.config = {'autostart': False}
        example.LZTMonitor.update_autostart(mock_self)  # must not raise


# ═══════════════════════════════════════════════════════════════════════════════
# LZTMonitor — check_now
# ═══════════════════════════════════════════════════════════════════════════════

class TestLZTMonitorCheckNow(unittest.TestCase):

    def test_when_active_sets_event(self):
        mock_self = MagicMock()
        mock_self.monitor_worker.bot_active = True
        example.LZTMonitor.check_now(mock_self)
        mock_self.monitor_worker.monitor_event.set.assert_called_once()

    def test_when_active_emits_log(self):
        mock_self = MagicMock()
        mock_self.monitor_worker.bot_active = True
        example.LZTMonitor.check_now(mock_self)
        mock_self.update_log.assert_called_once()

    def test_when_no_worker_emits_not_running(self):
        mock_self = MagicMock()
        mock_self.monitor_worker = None
        example.LZTMonitor.check_now(mock_self)
        log_text = mock_self.update_log.call_args[0][0]
        self.assertIn('не запущен', log_text.lower())

    def test_when_inactive_does_not_set_event(self):
        mock_self = MagicMock()
        mock_self.monitor_worker.bot_active = False
        example.LZTMonitor.check_now(mock_self)
        mock_self.monitor_worker.monitor_event.set.assert_not_called()


# ═══════════════════════════════════════════════════════════════════════════════
# LZTMonitor — clear_log / save_log
# ═══════════════════════════════════════════════════════════════════════════════

class TestLZTMonitorLogManagement(unittest.TestCase):

    def test_clear_log_clears_log_area(self):
        mock_self = MagicMock()
        example.LZTMonitor.clear_log(mock_self)
        mock_self.log_area.clear.assert_called_once()

    def test_clear_log_emits_log_entry(self):
        mock_self = MagicMock()
        example.LZTMonitor.clear_log(mock_self)
        mock_self.update_log.assert_called_once()

    def test_save_log_writes_file(self):
        mock_self = MagicMock()
        mock_self.log_area.toPlainText.return_value = 'log content'
        with patch('builtins.open', mock_open()) as m:
            example.LZTMonitor.save_log(mock_self)
        m.assert_called_once()
        handle = m()
        handle.write.assert_called_once_with('log content')

    def test_save_log_filename_has_timestamp(self):
        mock_self = MagicMock()
        mock_self.log_area.toPlainText.return_value = ''
        opened_paths = []
        with patch('builtins.open', mock_open()) as m:
            m.side_effect = lambda path, *a, **kw: (opened_paths.append(path), mock_open()())[1]
            example.LZTMonitor.save_log(mock_self)
        self.assertTrue(any('log_' in p for p in opened_paths))

    def test_save_log_error_calls_update_log(self):
        mock_self = MagicMock()
        with patch('builtins.open', side_effect=IOError('disk full')):
            example.LZTMonitor.save_log(mock_self)
        mock_self.update_log.assert_called()
        log_text = mock_self.update_log.call_args[0][0]
        self.assertIn('Ошибка', log_text)


# ═══════════════════════════════════════════════════════════════════════════════
# Global constants
# ═══════════════════════════════════════════════════════════════════════════════

class TestGlobalConstants(unittest.TestCase):

    def test_config_file_is_string(self):
        self.assertIsInstance(example.CONFIG_FILE, str)

    def test_default_config_has_required_keys(self):
        for key in ('itemID', 'telegram_bot_token', 'telegram_chat_id',
                    'check_interval', 'url', 'autostart', 'headless'):
            self.assertIn(key, example.DEFAULT_CONFIG, f"Missing key: {key}")

    def test_default_check_interval_positive(self):
        self.assertGreater(example.DEFAULT_CONFIG['check_interval'], 0)

    def test_color_constants_are_hex(self):
        for const in (example.BACKGROUND_COLOR, example.PRIMARY_COLOR,
                      example.SECONDARY_COLOR, example.TEXT_COLOR, example.HIGHLIGHT_COLOR):
            self.assertRegex(const, r'^#[0-9a-fA-F]{6}$', f"Not a hex color: {const}")


if __name__ == '__main__':
    unittest.main(verbosity=2)
