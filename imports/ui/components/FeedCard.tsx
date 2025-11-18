import React from 'react';

interface FeedCardProps {
  title: string;
  icon: string;
  isAvailable: boolean;
  isGenerating: boolean;
  feedUrl?: string | null;
}

const FeedCard: React.FC<FeedCardProps> = ({ 
  title, 
  icon, 
  isAvailable, 
  isGenerating,
  feedUrl
}) => {
  const handleViewXML = async () => {
    if (!isAvailable || !feedUrl) {
      return;
    }
    
    try {
      window.open(feedUrl, '_blank');
    } catch (error) {
      console.error('Error handling XML view:', error);
    }
  };

  return (
    <div
      style={{
        border: `2px solid ${isAvailable ? '#27ae60' : '#e1e8ed'}`,
        borderRadius: '12px',
        padding: '16px',
        background: isAvailable ? '#f8fff8' : '#fafbfc',
        transition: 'all 0.2s ease',
        minHeight: '80px',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '10px',
        marginBottom: '12px'
      }}>
        <span style={{ fontSize: '24px' }}>{icon}</span>
        <div>
          <span style={{ 
            fontWeight: '600',
            color: '#2c3e50',
            fontSize: '1em'
          }}>
            {title}
          </span>
        </div>
      </div>
      
      {isAvailable && feedUrl ? (
        <div>
          <button
            onClick={handleViewXML}
            disabled={!feedUrl}
            style={{
              color: '#3498db',
              textDecoration: 'none',
              fontSize: '0.9em',
              fontWeight: '500',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: '#f0f8ff',
              borderRadius: '6px',
              border: '1px solid #3498db30',
              transition: 'all 0.2s ease',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#e6f3ff';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f0f8ff';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            📄 View XML Feed
          </button>
        </div>
      ) : (
        <div style={{ 
          color: '#95a5a6',
          fontSize: '0.9em',
          fontStyle: 'italic'
        }}>
          {isGenerating ? '⏳ Generating...' : '❌ Not available'}
        </div>
      )}
    </div>
  );
};

export default FeedCard;
