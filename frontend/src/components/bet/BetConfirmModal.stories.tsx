import type { Meta, StoryObj } from '@storybook/react';
import { BetConfirmModal } from './BetConfirmModal';

const meta = {
  title: 'Components/Modal/BetConfirmModal',
  component: BetConfirmModal,
  args: {
    isOpen: true,
    fighter_a: 'Champion One',
    fighter_b: 'Challenger Two',
    side: 'fighter_a',
    amount_xlm: 10,
    estimated_payout_xlm: 18.5,
    fee_bps: 250,
    onConfirm: () => undefined,
    onCancel: () => undefined,
  },
  parameters: {
    docs: {
      description: {
        component: 'Accessible bet confirmation dialog with focus management and transaction states.',
      },
    },
  },
} satisfies Meta<typeof BetConfirmModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Confirmation: Story = {};
export const AwaitingSignature: Story = { args: { status: 'awaiting_signature' } };
export const Submitting: Story = { args: { status: 'submitting' } };
export const Confirmed: Story = { args: { status: 'confirmed' } };
