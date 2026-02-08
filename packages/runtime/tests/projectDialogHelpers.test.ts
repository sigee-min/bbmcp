import assert from 'node:assert/strict';

import { tryAutoConfirmProjectDialog } from '../src/adapters/blockbench/projectDialogHelpers';
import { ADAPTER_PROJECT_DIALOG_INPUT_REQUIRED } from '../src/shared/messages';

type TestDialog = {
  getFormResult?: () => Record<string, unknown> | null;
  setFormValues?: (values: Record<string, unknown>, silent?: boolean) => void;
  confirm?: () => void;
};

type TestGlobals = {
  Dialog?: { open?: TestDialog };
};

const getGlobals = (): TestGlobals => globalThis as unknown as TestGlobals;

const withGlobals = (overrides: TestGlobals, run: () => void) => {
  const globals = getGlobals();
  const before = { Dialog: globals.Dialog };
  globals.Dialog = overrides.Dialog;
  try {
    run();
  } finally {
    globals.Dialog = before.Dialog;
  }
};

{
  withGlobals({}, () => {
    const res = tryAutoConfirmProjectDialog('demo', { formatId: 'geckolib_model', formatKind: 'geckolib' });
    assert.deepEqual(res, { ok: true });
  });
}

{
  const applied: Array<Record<string, unknown>> = [];
  withGlobals({ Dialog: {} }, () => {
    const dialogApi = getGlobals().Dialog!;
    const dialog: TestDialog = {
      getFormResult: () => ({ name: '', format: '', parent: '' }),
      setFormValues: (values) => {
        applied.push({ ...values });
      },
      confirm: () => {
        dialogApi.open = undefined;
      }
    };
    dialogApi.open = dialog;
    const res = tryAutoConfirmProjectDialog('dragon', {
      formatId: 'geckolib_model',
      dialog: { parent: 'root' }
    });
    assert.deepEqual(res, { ok: true });
    assert.equal(applied.length, 1);
    assert.equal(applied[0].name, 'dragon');
    assert.equal(applied[0].format, 'geckolib_model');
    assert.equal(applied[0].parent, 'root');
  });
}

{
  const applied: Array<Record<string, unknown>> = [];
  withGlobals({ Dialog: {} }, () => {
    let stage = 0;
    const dialogApi = getGlobals().Dialog!;
    const dialog: TestDialog = {
      getFormResult: () => {
        if (stage === 0) return { name: '', format: '', parent: '' };
        if (stage === 1) return { name: 'dragon', format: '', parent: '' };
        return { name: 'dragon', format: '', parent: '' };
      },
      setFormValues: (values) => {
        applied.push({ ...values });
      },
      confirm: () => {
        stage += 1;
      }
    };
    dialogApi.open = dialog;
    const res = tryAutoConfirmProjectDialog('dragon', {
      formatKind: 'geckolib'
    });
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'invalid_state');
      assert.equal(res.error.message, ADAPTER_PROJECT_DIALOG_INPUT_REQUIRED);
      assert.deepEqual(res.error.details?.missing, ['format', 'parent']);
      assert.ok(String(res.error.fix).includes('format, parent'));
    }
    assert.equal(applied.length, 1);
    assert.equal(applied[0].name, 'dragon');
    assert.equal(applied[0].format, 'geckolib');
  });
}
