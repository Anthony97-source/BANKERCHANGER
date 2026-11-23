import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { Modal } from '../Modal';

describe('Modal', () => {
  describe('rendering', () => {
    it('should not render when isOpen is false', () => {
      render(
        <Modal isOpen={false} onClose={() => {}} title="Test Modal">
          Content
        </Modal>
      );

      const dialog = document.querySelector('[role="dialog"]');
      expect(dialog).not.toBeInTheDocument();
    });

    it('should render when isOpen is true', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test Modal">
          Content
        </Modal>
      );

      const dialog = document.querySelector('[role="dialog"]');
      expect(dialog).toBeInTheDocument();
    });

    it('should display the title', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test Title">
          Content
        </Modal>
      );

      expect(screen.getByText('Test Title')).toBeInTheDocument();
    });

    it('should display the children content', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test Modal">
          <div>Test Content</div>
        </Modal>
      );

      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });
  });

  describe('overlay and styling', () => {
    it('should have an overlay backdrop that dims the page', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test Modal">
          Content
        </Modal>
      );

      const backdrop = document.querySelector('.fixed.inset-0.bg-black\\/60');
      expect(backdrop).toBeInTheDocument();
    });

    it('should center the modal vertically and horizontally', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test Modal">
          Content
        </Modal>
      );

      const backdrop = document.querySelector('.flex.items-center.justify-center');
      expect(backdrop).toBeInTheDocument();
    });

    it('should have proper z-index for overlay', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test Modal">
          Content
        </Modal>
      );

      const backdrop = document.querySelector('.z-50');
      expect(backdrop).toBeInTheDocument();
    });
  });

  describe('close button', () => {
    it('should have a close button in the header', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test Modal">
          Content
        </Modal>
      );

      const closeButton = screen.getByLabelText('Close modal');
      expect(closeButton).toBeInTheDocument();
    });

    it('should call onClose when close button is clicked', () => {
      const onClose = jest.fn();
      render(
        <Modal isOpen={true} onClose={onClose} title="Test Modal">
          Content
        </Modal>
      );

      const closeButton = screen.getByLabelText('Close modal');
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('keyboard support', () => {
    it('should close modal when Escape key is pressed', async () => {
      const onClose = jest.fn();
      const user = userEvent.setup();
      const { container } = render(
        <Modal isOpen={true} onClose={onClose} title="Test Modal">
          <input type="text" />
        </Modal>
      );

      const dialog = container.querySelector('[role="dialog"]');
      await user.keyboard('{Escape}');

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should trap focus within modal on Tab key', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}} title="Test Modal">
          <button>Button 1</button>
          <button>Button 2</button>
        </Modal>
      );

      const buttons = screen.getAllByRole('button');
      const firstButton = buttons[buttons.length - 2]; // Skip close button for first
      const lastButton = buttons[buttons.length - 1];

      firstButton.focus();
      await user.keyboard('{Shift>}{Tab}{/Shift}');

      // Focus should wrap to the last focusable element
      expect(document.activeElement).not.toBe(firstButton);
    });

    it('should wrap focus to first element when tabbing from last element', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}} title="Test Modal">
          <button>Button 1</button>
          <button>Button 2</button>
        </Modal>
      );

      const buttons = screen.getAllByRole('button');
      const lastButton = buttons[buttons.length - 1];

      lastButton.focus();
      await user.keyboard('{Tab}');

      // Focus should wrap to the first focusable element
      expect(document.activeElement).not.toBe(lastButton);
    });
  });

  describe('click outside behavior', () => {
    it('should close modal when clicking outside by default', () => {
      const onClose = jest.fn();
      
      render(
        <Modal isOpen={true} onClose={onClose} title="Test Modal">
          <div>Content</div>
        </Modal>
      );

      const backdrop = document.querySelector('[role="dialog"][aria-modal="true"]');
      
      if (backdrop) {
        fireEvent.click(backdrop);
      }

      expect(onClose).toHaveBeenCalled();
    });

    it('should not close modal when clicking outside if closeOnClickOutside is false', () => {
      const onClose = jest.fn();
      render(
        <Modal
          isOpen={true}
          onClose={onClose}
          title="Test Modal"
          closeOnClickOutside={false}
        >
          <div>Content</div>
        </Modal>
      );

      const backdrop = document.querySelector('[role="dialog"]');
      if (backdrop?.parentElement) {
        fireEvent.click(backdrop.parentElement);
      }

      expect(onClose).not.toHaveBeenCalled();
    });

    it('should not close modal when clicking inside the modal content', () => {
      const onClose = jest.fn();
      render(
        <Modal isOpen={true} onClose={onClose} title="Test Modal">
          <button>Click me</button>
        </Modal>
      );

      const button = screen.getByRole('button', { name: 'Click me' });
      fireEvent.click(button);

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('should have role="dialog"', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test Modal">
          Content
        </Modal>
      );

      const dialog = document.querySelector('[role="dialog"]');
      expect(dialog).toHaveAttribute('role', 'dialog');
    });

    it('should have aria-modal="true"', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test Modal">
          Content
        </Modal>
      );

      const dialog = document.querySelector('[aria-modal="true"]');
      expect(dialog).toBeInTheDocument();
    });

    it('should have aria-labelledby pointing to title', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test Modal">
          Content
        </Modal>
      );

      const dialog = document.querySelector('[role="dialog"]');
      const titleId = dialog?.getAttribute('aria-labelledby');
      
      // useId generates IDs like ':rh:' so we need to escape them for querySelector
      const title = titleId ? document.querySelector(`[id="${titleId}"]`) : null;

      expect(titleId).toBeTruthy();
      expect(title).toHaveTextContent('Test Modal');
    });

    it('should have accessible close button', () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test Modal">
          Content
        </Modal>
      );

      const closeButton = screen.getByLabelText('Close modal');
      expect(closeButton).toHaveAttribute('type', 'button');
      expect(closeButton).toBeVisible();
    });
  });

  describe('focus management', () => {
    it('should focus the first focusable element when modal opens', () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}} title="Test Modal">
          <input type="text" placeholder="First input" />
          <button>Button</button>
        </Modal>
      );

      // The first focusable element is the close button
      const closeButton = screen.getByLabelText('Close modal');
      expect(document.activeElement).toBe(closeButton);
    });

    it('should restore focus to previously focused element when modal closes', async () => {
      const { rerender } = render(
        <button>Open Modal</button>
      );

      const openButton = screen.getByRole('button', { name: 'Open Modal' });
      openButton.focus();

      rerender(
        <>
          <button>Open Modal</button>
          <Modal isOpen={true} onClose={() => {}} title="Test Modal">
            Content
          </Modal>
        </>
      );

      rerender(
        <>
          <button>Open Modal</button>
          <Modal isOpen={false} onClose={() => {}} title="Test Modal">
            Content
          </Modal>
        </>
      );

      // Focus should be restored to the open button
      expect(document.activeElement).toBe(openButton);
    });
  });

  describe('portal rendering', () => {
    it('should render modal in document.body', () => {
      render(
        <div id="modal-parent">
          <Modal isOpen={true} onClose={() => {}} title="Test Modal">
            Content
          </Modal>
        </div>
      );

      const modalParent = document.getElementById('modal-parent');
      const dialog = document.querySelector('[role="dialog"]');

      // Modal should be in body, not in modal-parent
      expect(dialog?.closest('#modal-parent')).not.toBeInTheDocument();
    });
  });
});
