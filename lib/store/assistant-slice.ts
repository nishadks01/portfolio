import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type AssistantMessage = { role: 'user' | 'assistant'; content: string };
export type AssistantChange = { operation: 'create' | 'update' | 'delete'; section: string; id?: string | null; fields: Record<string, unknown> };
export type AssistantPendingAction = { summary: string; changes: AssistantChange[] };
export type AssistantState = { messages: AssistantMessage[]; pending: AssistantPendingAction | null };

export const assistantWelcome: AssistantMessage = { role: 'assistant', content: 'I’m ready to help manage your portfolio. Ask me to update your profile, projects, tools, experience, skills, education, wallpapers, or videos. I will show proposed changes before saving them.' };

const initialState: AssistantState = { messages: [assistantWelcome], pending: null };

const assistantSlice = createSlice({
  name: 'assistant',
  initialState,
  reducers: {
    addAssistantMessage: (state, action: PayloadAction<AssistantMessage>) => {
      state.messages = [...state.messages, action.payload].slice(-40);
    },
    setAssistantPending: (state, action: PayloadAction<AssistantPendingAction | null>) => {
      state.pending = action.payload;
    },
    hydrateAssistant: (_state, action: PayloadAction<AssistantState>) => action.payload,
    clearAssistantHistory: () => initialState
  }
});

export const { addAssistantMessage, setAssistantPending, hydrateAssistant, clearAssistantHistory } = assistantSlice.actions;
export default assistantSlice.reducer;
