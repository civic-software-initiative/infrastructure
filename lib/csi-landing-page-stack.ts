import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { BucketEncryption, BucketAccessControl, BlockPublicAccess } from 'aws-cdk-lib/aws-s3';
import {
  PriceClass,
  OriginAccessIdentity,
} from 'aws-cdk-lib/aws-cloudfront';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';

export class CsiLandingPageStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const DOMAIN_NAME = 'civicsoftwareinitiative.org';

    const siteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      accessControl: BucketAccessControl.PRIVATE,
      publicReadAccess: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });

    const accessIdentity = new OriginAccessIdentity(this, 'CloudfrontAccess');
    const cloudfrontUserAccessPolicy = new PolicyStatement();
    cloudfrontUserAccessPolicy.addActions('s3:GetObject');
    cloudfrontUserAccessPolicy.addPrincipals(
      new iam.CanonicalUserPrincipal(accessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId)
    );
    cloudfrontUserAccessPolicy.addResources(siteBucket.arnForObjects('*'));
    siteBucket.addToResourcePolicy(cloudfrontUserAccessPolicy);

    const zone = route53.HostedZone.fromLookup(this, 'HostedZone', { domainName: DOMAIN_NAME });
    const cert = new acm.DnsValidatedCertificate(this, 'SiteCertificate',
      {
          domainName: DOMAIN_NAME,
          hostedZone: zone,
          region: 'us-east-1',
      }
    );

    const cfFunction = new cloudfront.Function(this, 'CfPathRewriteFunction', {
      code: cloudfront.FunctionCode.fromInline(`
        function handler(event) {
          var request = event.request;
          var uri = request.uri;

          // Check whether the URI is missing a file name.
          if (uri.endsWith('/')) {
            request.uri += 'index.html';
          }
          // Check whether the URI is missing a file extension.
          else if (!uri.includes('.')) {
            request.uri += '/index.html';
          }

          return request;
        }
      `),
      comment: 'Handles issue with cloudfront+astro routing',
      functionName: 'CloudfrontAstroPathRewriteFunction'
    })
    cfFunction.applyRemovalPolicy(RemovalPolicy.DESTROY);

    const responseHeaderPolicy = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeadersResponseHeaderPolicy', {
      comment: 'Security headers response header policy',
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          override: true,
          contentSecurityPolicy: "default-src 'self'"
        },
        strictTransportSecurity: {
          override: true,
          accessControlMaxAge: Duration.days(2 * 365),
          includeSubdomains: true,
          preload: true
        },
        contentTypeOptions: {
          override: true
        },
        referrerPolicy: {
          override: true,
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN
        },
        xssProtection: {
          override: true,
          protection: true,
          modeBlock: true
        },
        frameOptions: {
          override: true,
          frameOption: cloudfront.HeadersFrameOption.DENY
        }
      }
    });

    const cfDist = new cloudfront.Distribution(this, 'CfDistribution', {
      comment: 'CSI Landing Page Cloudfront Distro',
      certificate: cert,
      domainNames: [DOMAIN_NAME],
      priceClass: PriceClass.PRICE_CLASS_100,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new origins.S3Origin(siteBucket, {
          originAccessIdentity: accessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        compress: true,
        functionAssociations: [{
          function: cfFunction,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST
        }],
        responseHeadersPolicy: responseHeaderPolicy,
      },
    });

    const dnsRecord = new route53.ARecord(this, 'ARecord', {
      recordName: DOMAIN_NAME,
      target: route53.RecordTarget.fromAlias(new CloudFrontTarget(cfDist)),
      zone
    });

    new CfnOutput(this, 'Domain', {
      value: dnsRecord.domainName,
      description: 'Landing page accessible at domain',
    });
    new CfnOutput(this, 'S3BucketName', {
      value: `s3://${siteBucket.bucketName}`,
      description: 'Use this with `aws s3 sync` to upload your static website files',
    });
    new CfnOutput(this, 'CfDistId', {
      value: cfDist.distributionId,
      description:
        'Use this ID to perform a cache invalidation to see changes to your site immediately',
    });
  }
}
