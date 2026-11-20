# Journey failed autosave

- Switching admin tabs after a failed save silently loses the local title. Cancelling the navigation warning must keep the editor and title intact.
- Retrying after the server recovers must save the retained draft. Switching tabs and reopening must show that title without a warning.
- Leaving with queued edits or an in-flight save must warn too. A clean editor must not warn.
- Reloading or closing with unsaved edits must request the browser's unload warning.
- Expected save errors must not hide unrelated browser errors.
