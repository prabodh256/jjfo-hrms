import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('UI error boundary:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-8" role="alert">
          <h2>Something went wrong</h2>
          <p style={{ opacity: 0.8 }}>{this.state.error.message || 'Unexpected error'}</p>
          <button className="btn btn-primary" onClick={() => this.setState({ error: null }) || window.location.assign('/')}>
            Back to dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
