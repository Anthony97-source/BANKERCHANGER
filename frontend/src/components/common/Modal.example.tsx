'use client';

import { useState } from 'react';
import { Modal } from './Modal';

/**
 * Example usage of the Modal component
 */
export function ModalExample(): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-blue-500 text-white rounded"
      >
        Open Modal
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Example Modal"
        closeOnClickOutside={true}
      >
        <div className="space-y-4">
          <p>This is a modal dialog with the following features:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Overlay backdrop that dims the page</li>
            <li>Centered modal (vertically and horizontally)</li>
            <li>Close button in the header</li>
            <li>Escape key closes the modal</li>
            <li>Click outside closes the modal (optional)</li>
            <li>Accessible (WCAG compliant)</li>
            <li>Focus trap and management</li>
            <li>Rendered via portal to avoid stacking context issues</li>
          </ul>
          <button
            onClick={() => setIsOpen(false)}
            className="w-full px-4 py-2 bg-gray-200 text-black rounded"
          >
            Close Modal
          </button>
        </div>
      </Modal>
    </div>
  );
}
