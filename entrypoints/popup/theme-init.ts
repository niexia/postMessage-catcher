import { applyStoredTheme } from '../../lib/theme';

// Runs before the React bundle so the popup does not flash the wrong theme.
applyStoredTheme();
