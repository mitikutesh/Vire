import type { GrocState } from './schema';

/** Nothing ticked, nothing assigned — what every new week starts as. */
export const emptyGrocState = (): GrocState => ({ checked: {}, store: {} });
