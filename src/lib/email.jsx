import * as React from 'react';

export function Email(props) {
  const { url } = props;
  const expiryTime = "10 minutes";

  return (
    <div style={{
      backgroundColor: '#f5f5f5',
      padding: '40px 0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      minHeight: '100vh'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '100%',
        margin: '0 auto',
        backgroundColor: '#211f22'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #211f22 0%, #2d2b2e 100%)',
          padding: '50px 20px',
          textAlign: 'center',
          borderBottom: '2px solid rgba(182, 255, 0, 0.2)'
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '30px',
            userSelect: 'none'
          }}>
            <img 
              src="https://casualcall.com/logo.webp" 
              alt="CasualCall Logo"
              width="40"
              height="40"
              style={{
                display: 'block',
                width: '40px',
                height: '40px'
              }}
            />
            <span style={{
              fontSize: '28px',
              fontWeight: 'bold',
              color: '#ffffff'
            }}>
              <span style={{ color: '#b6ff00' }}>Cashual</span>Call
            </span>
          </div>
          <h1 style={{
            fontSize: '36px',
            fontWeight: 'bold',
            color: '#ffffff',
            margin: '0 0 15px 0',
            lineHeight: '1.2'
          }}>
            Verify Your Account
          </h1>
          <p style={{
            fontSize: '18px',
            color: '#b3b3b3',
            margin: '0',
            maxWidth: '600px',
            marginLeft: 'auto',
            marginRight: 'auto'
          }}>
            Click the button below to verify your email and get started
          </p>
        </div>

        {/* Main Content */}
        <div style={{
          padding: '60px 20px',
          backgroundColor: '#211f22'
        }}>
          <div style={{
            maxWidth: '700px',
            margin: '0 auto'
          }}>
            <div style={{
              backgroundColor: '#2d2b2e',
              borderRadius: '12px',
              padding: '40px',
              marginBottom: '30px',
              border: '1px solid rgba(182, 255, 0, 0.15)'
            }}>
              <p style={{
                fontSize: '18px',
                color: '#f5f5f5',
                lineHeight: '1.8',
                margin: '0 0 30px 0',
                textAlign: 'center'
              }}>
                Welcome to <span style={{ color: '#b6ff00', fontWeight: '600' }}>CasualCall</span>! To complete your registration and start connecting with strangers through video and text chat, please verify your email address.
              </p>

              {/* CTA Button */}
              <div style={{ textAlign: 'center', margin: '40px 0' }}>
                <a href={url} style={{
                  display: 'inline-block',
                  backgroundColor: '#b6ff00',
                  color: '#211f22',
                  fontSize: '18px',
                  fontWeight: '700',
                  padding: '18px 50px',
                  borderRadius: '12px',
                  textDecoration: 'none',
                  boxShadow: '0 6px 20px rgba(182, 255, 0, 0.4)',
                  letterSpacing: '0.5px'
                }}>
                  Verify Email Address
                </a>
              </div>

              <p style={{
                fontSize: '15px',
                color: '#b3b3b3',
                lineHeight: '1.6',
                margin: '30px 0 0 0',
                textAlign: 'center'
              }}>
                This link will expire in <span style={{ color: '#b6ff00', fontWeight: '600' }}>{expiryTime}</span>
              </p>
            </div>

            {/* Alternative Link */}
            <div style={{
              backgroundColor: '#2d2b2e',
              borderRadius: '12px',
              padding: '25px 30px',
              border: '1px solid rgba(181, 156, 251, 0.15)',
              marginBottom: '30px'
            }}>
              <p style={{
                fontSize: '14px',
                color: '#b3b3b3',
                margin: '0 0 12px 0',
                fontWeight: '600'
              }}>
                Button not working? Copy and paste this link:
              </p>
              <div style={{
                backgroundColor: '#211f22',
                padding: '15px',
                borderRadius: '8px',
                border: '1px solid rgba(182, 255, 0, 0.2)',
                wordBreak: 'break-all'
              }}>
                <a href={url} style={{
                  color: '#b6ff00',
                  fontSize: '13px',
                  textDecoration: 'none'
                }}>
                  {url}
                </a>
              </div>
            </div>

            {/* Features Preview */}
            <div style={{
              padding: '35px',
              backgroundColor: 'rgba(45, 43, 46, 0.5)',
              borderRadius: '12px',
              border: '1px solid rgba(182, 255, 0, 0.1)'
            }}>
              <h2 style={{
                fontSize: '22px',
                color: '#ffffff',
                margin: '0 0 25px 0',
                fontWeight: '600',
                textAlign: 'center'
              }}>
                What's waiting for you:
              </h2>
              <div style={{ 
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '20px',
                maxWidth: '600px',
                margin: '0 auto'
              }}>
                {[
                  { icon: '💬', text: 'Chat anonymously with people worldwide' },
                  { icon: '🎥', text: 'Connect via voice and video calls' },
                  { icon: '💰', text: 'Earn cash rewards for conversations' },
                  { icon: '🔒', text: 'Safe and moderated community' }
                ].map((feature, index) => (
                  <div key={index} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '12px',
                    backgroundColor: '#2d2b2e',
                    padding: '15px',
                    borderRadius: '8px',
                    border: '1px solid rgba(182, 255, 0, 0.1)'
                  }}>
                    <span style={{ fontSize: '24px', flexShrink: 0 }}>{feature.icon}</span>
                    <span style={{ fontSize: '14px', color: '#f5f5f5', lineHeight: '1.4' }}>{feature.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          backgroundColor: '#2d2b2e',
          padding: '40px 20px',
          textAlign: 'center',
          borderTop: '1px solid rgba(182, 255, 0, 0.1)'
        }}>
          <p style={{
            fontSize: '14px',
            color: '#b3b3b3',
            margin: '0 0 20px 0',
            lineHeight: '1.6'
          }}>
            If you didn't request this email, you can safely ignore it.
          </p>
          <p style={{
            fontSize: '13px',
            color: '#666666',
            margin: '0 0 20px 0'
          }}>
            © 2025 CasualCall. All rights reserved.
          </p>
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '25px',
            flexWrap: 'wrap',
            marginTop: '20px'
          }}>
            <a href="https://casualcall.com/privacy" style={{
              fontSize: '13px',
              color: '#b59cfb',
              textDecoration: 'none'
            }}>Privacy Policy</a>
            <a href="https://casualcall.com/terms" style={{
              fontSize: '13px',
              color: '#b59cfb',
              textDecoration: 'none'
            }}>Terms of Service</a>
            <a href="https://casualcall.com/support" style={{
              fontSize: '13px',
              color: '#b59cfb',
              textDecoration: 'none'
            }}>Support</a>
          </div>
        </div>
      </div>

      {/* Email Client Safety Text */}
      <div style={{
        maxWidth: '600px',
        margin: '30px auto 0',
        padding: '0 20px',
        textAlign: 'center'
      }}>
        <p style={{
          fontSize: '11px',
          color: '#666666',
          margin: '0'
        }}>
          This email was sent to verify your CasualCall account.
        </p>
      </div>
    </div>
  );
}

export default Email;