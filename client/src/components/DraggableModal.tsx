import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Modal } from 'antd';
import type { ModalProps } from 'antd';

interface DraggableModalProps extends ModalProps {
  minWidth?: number;
  minHeight?: number;
  defaultWidth?: number;
  defaultHeight?: number;
  resizable?: boolean;
}

const DraggableModal: React.FC<DraggableModalProps> = ({
  children,
  title,
  open,
  onCancel,
  minWidth = 400,
  minHeight = 300,
  defaultWidth,
  defaultHeight,
  resizable = true,
  width: propWidth,
  style,
  bodyStyle,
  modalRender,
  ...restProps
}) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, startWidth: 0, startHeight: 0 });
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      const w = typeof propWidth === 'number' ? propWidth : defaultWidth || (typeof propWidth === 'string' ? 0 : 0);
      setSize({
        width: w || 520,
        height: defaultHeight || 0
      });
      setPosition({ x: 0, y: 0 });
    }
  }, [open, propWidth, defaultWidth, defaultHeight]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.ant-modal-close')) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startX: position.x,
      startY: position.y
    };
    e.preventDefault();
  }, [position]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    const rect = modalRef.current?.getBoundingClientRect();
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startWidth: rect?.width || (typeof propWidth === 'number' ? propWidth : 520),
      startHeight: rect?.height || 0
    };
  }, [propWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        setPosition({
          x: dragStartRef.current.startX + dx,
          y: dragStartRef.current.startY + dy
        });
      }
      if (isResizing) {
        const dx = e.clientX - resizeStartRef.current.x;
        const dy = e.clientY - resizeStartRef.current.y;
        const newWidth = Math.max(minWidth, resizeStartRef.current.startWidth + dx);
        const newHeight = Math.max(minHeight, resizeStartRef.current.startHeight + dy);
        setSize({ width: newWidth, height: newHeight });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
    };
  }, [isDragging, isResizing, minWidth, minHeight]);

  const customModalRender = useCallback((modal: React.ReactNode) => {
    const modalContent = (
      <div
        ref={modalRef}
        className="draggable-modal-content"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          width: size.width || undefined,
          height: size.height || undefined,
          cursor: isDragging ? 'grabbing' : 'default',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {modal}
        {resizable && (
          <div
            className="modal-resize-handle"
            onMouseDown={handleResizeStart}
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: 18,
              height: 18,
              cursor: 'nwse-resize',
              zIndex: 10
            }}
          >
            <svg viewBox="0 0 18 18" width="18" height="18" style={{ opacity: 0.4 }}>
              <path d="M16 14l-2 2m2-6l-4 4m-6 0l-4 4" stroke="#999" strokeWidth="2" fill="none" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </div>
    );
    if (modalRender) {
      return modalRender(modalContent);
    }
    return modalContent;
  }, [position, size, isDragging, resizable, handleResizeStart, modalRender]);

  return (
    <Modal
      {...restProps}
      open={open}
      title={
        <div
          className="draggable-modal-title"
          onMouseDown={handleDragStart}
          style={{ cursor: isDragging ? 'grabbing' : 'grab', margin: '-20px -24px', padding: '16px 24px', marginBottom: 0 }}
        >
          {title}
        </div>
      }
      onCancel={onCancel}
      width={size.width || propWidth}
      modalRender={customModalRender}
      style={{
        ...style,
        top: 80
      }}
      styles={{
        body: {
          flex: 1,
          overflow: 'auto',
          padding: '20px 24px',
          ...(bodyStyle || {})
        }
      }}
    >
      {children}
    </Modal>
  );
};

export default DraggableModal;
