import React from 'react';

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-overlay open" onMouseDown={onClose}>
      <div className="modal-card glass" style={wide ? { maxWidth: '760px' } : undefined} onMouseDown={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}><i className="material-icons-round">close</i></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default Modal;
