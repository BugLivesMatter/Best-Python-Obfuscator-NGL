"""
Patches heavy/GUI dependencies before any test module imports example.py.
This file is loaded automatically by pytest before any test collection.
When using plain unittest: run via  python -m pytest tests/
"""
import sys
import os
from unittest.mock import MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


# ── Minimal Qt class stubs (so class inheritance doesn't hit metaclass issues) ─
class _QObject:
    def __init__(self, *a, **kw): pass


class _QMainWindow(_QObject):
    def __init__(self, *a, **kw): pass
    def statusBar(self):         return MagicMock()
    def setWindowTitle(self, *a): pass
    def setWindowIcon(self, *a):  pass
    def setGeometry(self, *a):    pass
    def setStyleSheet(self, *a):  pass
    def setCentralWidget(self, *a): pass
    def show(self):   pass
    def hide(self):   pass
    def windowState(self): return 0


def _pyqtSignal(*args, **kwargs):
    """Returns a fresh mock signal so each signal is independent."""
    m = MagicMock()
    m.emit    = MagicMock()
    m.connect = MagicMock()
    return m


# ── Build mock modules ──────────────────────────────────────────────────────────
_mock_qtcore = MagicMock()
_mock_qtcore.QObject     = _QObject
_mock_qtcore.pyqtSignal  = _pyqtSignal
_mock_qtcore.Qt          = MagicMock()
_mock_qtcore.QTimer      = MagicMock()

_mock_qtwidgets = MagicMock()
_mock_qtwidgets.QMainWindow  = _QMainWindow
_mock_qtwidgets.QApplication = MagicMock()

sys.modules.update({
    'PyQt5':                                        MagicMock(),
    'PyQt5.QtWidgets':                              _mock_qtwidgets,
    'PyQt5.QtGui':                                  MagicMock(),
    'PyQt5.QtCore':                                 _mock_qtcore,
    'selenium':                                     MagicMock(),
    'selenium.webdriver':                           MagicMock(),
    'selenium.webdriver.chrome':                    MagicMock(),
    'selenium.webdriver.chrome.options':            MagicMock(),
    'selenium.webdriver.common':                    MagicMock(),
    'selenium.webdriver.common.by':                 MagicMock(),
    'selenium.webdriver.support':                   MagicMock(),
    'selenium.webdriver.support.ui':                MagicMock(),
    'selenium.webdriver.support.expected_conditions': MagicMock(),
    'winreg':                                       MagicMock(),
})
