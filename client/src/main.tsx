import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import 'antd/dist/reset.css';
import './index.css';

function initDraggableModals() {
  let dragState: {
    modal: HTMLElement | null;
    startX: number;
    startY: number;
    startTransform: { x: number; y: number };
  } | null = null;

  const getTransformValues = (el: HTMLElement) => {
    const transform = el.style.transform || window.getComputedStyle(el).transform;
    if (!transform || transform === 'none') return { x: 0, y: 0 };
    const match = transform.match(/translate\(\s*(-?\d+(?:\.\d+)?)px\s*,\s*(-?\d+(?:\.\d+)?)px\s*\)/);
    if (match) return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
    const matrixMatch = transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/);
    if (matrixMatch) return { x: parseFloat(matrixMatch[1]), y: parseFloat(matrixMatch[2]) };
    return { x: 0, y: 0 };
  };

  const handleMouseDown = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.ant-modal-close') || target.closest('button') || target.closest('a')) return;
    const modalHeader = target.closest('.ant-modal-header');
    if (!modalHeader) return;

    const modal = modalHeader.closest('.ant-modal') as HTMLElement | null;
    if (!modal) return;

    const startTransform = getTransformValues(modal);
    dragState = {
      modal,
      startX: e.clientX,
      startY: e.clientY,
      startTransform
    };

    modal.classList.add('draggable-modal-moving');
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!dragState || !dragState.modal) return;

    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    const newX = dragState.startTransform.x + dx;
    const newY = dragState.startTransform.y + dy;

    dragState.modal.style.transform = `translate(${newX}px, ${newY}px)`;
  };

  const handleMouseUp = () => {
    if (dragState && dragState.modal) {
      dragState.modal.classList.remove('draggable-modal-moving');
    }
    dragState = null;
  };

  document.addEventListener('mousedown', handleMouseDown, true);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
}

initDraggableModals();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={{
      token: {
        colorPrimary: '#1a73e8',
        borderRadius: 8,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif",
        fontSize: 14,
        wireframe: false,
        colorLink: '#1a73e8',
        colorSuccess: '#1e8e3e',
        colorWarning: '#f9ab00',
        colorError: '#d93025',
        colorInfo: '#1a73e8',
        boxShadow: '0 1px 2px 0 rgba(60,64,67,0.1), 0 1px 3px 1px rgba(60,64,67,0.06)',
        boxShadowSecondary: '0 1px 3px 0 rgba(60,64,67,0.15), 0 4px 8px 3px rgba(60,64,67,0.08)',
      },
      components: {
        Button: {
          borderRadius: 20,
          controlHeight: 36,
          paddingInline: 20,
          fontWeight: 500,
        },
        Card: {
          borderRadiusLG: 12,
          boxShadow: '0 1px 2px 0 rgba(60,64,67,0.1), 0 1px 3px 1px rgba(60,64,67,0.06)',
        },
        Input: {
          borderRadius: 8,
          controlHeight: 40,
          activeShadow: '0 0 0 2px rgba(26,115,232,0.2)',
        },
        Select: {
          borderRadius: 8,
          controlHeight: 40,
        },
        DatePicker: {
          borderRadius: 8,
          controlHeight: 40,
        },
        Table: {
          borderRadius: 8,
          headerBg: '#f8f9fa',
          headerColor: '#5f6368',
          rowHoverBg: '#f1f3f4',
          borderColor: 'transparent',
          headerSplitColor: 'transparent',
        },
        Modal: {
          borderRadiusLG: 16,
          headerBg: '#ffffff',
          titleFontSize: 18,
        },
        Tabs: {
          itemSelectedColor: '#1a73e8',
          inkBarColor: '#1a73e8',
          titleFontSize: 14,
          horizontalItemPadding: '12px 16px',
        },
        Tag: {
          borderRadiusSM: 6,
        },
        Menu: {
          itemSelectedBg: '#e8f0fe',
          itemSelectedColor: '#1a73e8',
          itemHoverBg: '#f1f3f4',
          borderRadius: 0,
          itemMarginInline: 0,
        },
        Form: {
          labelFontSize: 13,
          labelColor: '#5f6368',
        },
        Breadcrumb: {
          fontSize: 13,
          colorText: '#5f6368',
          linkColor: '#5f6368',
        },
      }
    }}>
      <AntdApp>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <App />
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>
);
