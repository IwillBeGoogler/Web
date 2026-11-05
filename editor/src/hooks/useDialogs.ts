import { dialogs } from '../lib/dialogs';

/** `const confirm = useConfirm(); if (await confirm({ title: 'Delete page?', danger: true })) ...` */
export const useConfirm = () => dialogs.confirm;
/** `const name = await usePrompt()({ title: 'Rename', initial, validate })` -> trimmed string | null */
export const usePrompt = () => dialogs.prompt;
/** several labelled outcomes -> the chosen value | null */
export const useChoice = () => dialogs.choose;
/** any form body -> value | null */
export const useCustomDialog = () => dialogs.custom;
