import { createContext, useContext } from 'react';

/** id of the control a <Field> labels; form controls inside a Field pick it up so the visible label is tied to the input. */
export const FieldIdCtx = createContext<string | undefined>(undefined);
export const useFieldId = (): string | undefined => useContext(FieldIdCtx);
