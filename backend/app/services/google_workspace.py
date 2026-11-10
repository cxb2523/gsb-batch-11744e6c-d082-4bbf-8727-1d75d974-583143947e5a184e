"""
Google Workspace Directory API Service
Handles user synchronization from Google Workspace using OAuth access tokens
"""
from typing import List, Dict, Optional
from datetime import datetime
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


class GoogleWorkspaceService:
    """Service for interacting with Google Workspace Directory API using OAuth"""

    def __init__(self, access_token: str):
        """
        Initialize Google Workspace service with OAuth access token

        Args:
            access_token: OAuth access token from authenticated user
        """
        if not access_token:
            raise ValueError("Google access token not provided")

        self.access_token = access_token
        self.service = None

    def _get_service(self):
        """Build and return the Directory API service"""
        if self.service:
            return self.service

        try:
            # Create credentials from access token
            credentials = Credentials(token=self.access_token)

            # Build the service
            self.service = build('admin', 'directory_v1', credentials=credentials)
            return self.service

        except Exception as e:
            raise Exception(f"Failed to initialize Google Workspace service: {str(e)}")

    def list_users(
        self,
        customer: str = 'my_customer',
        domain: Optional[str] = None,
        max_results: int = 500,
        query: Optional[str] = None
    ) -> List[Dict]:
        """
        List all users from Google Workspace

        Args:
            customer: Customer ID or 'my_customer' for the account's customer
            domain: Domain name to filter users
            max_results: Maximum number of results per page
            query: Search query (e.g., 'orgUnitPath=/Engineering')

        Returns:
            List of user dictionaries with user information
        """
        service = self._get_service()
        users = []

        # customer and domain are alternatives, not a pair: the Directory API rejects
        # a request carrying both. A configured domain is the more precise of the two
        # (it names one domain of the account rather than all of them), so it wins
        # when present and 'my_customer' remains the fallback.
        scope_kwargs = {'domain': domain} if domain else {'customer': customer}

        try:
            # Initial request
            request = service.users().list(
                **scope_kwargs,
                maxResults=max_results,
                query=query,
                orderBy='email'
            )

            while request is not None:
                response = request.execute()
                users.extend(response.get('users', []))

                # Get next page
                request = service.users().list_next(request, response)

            return users

        except HttpError as error:
            raise Exception(f"Failed to list users from Google Workspace: {error}")

    def get_user(self, user_key: str) -> Optional[Dict]:
        """
        Get a specific user by email or ID

        Args:
            user_key: User's primary email or unique ID

        Returns:
            User dictionary or None if not found
        """
        service = self._get_service()

        try:
            user = service.users().get(userKey=user_key).execute()
            return user
        except HttpError as error:
            if error.resp.status == 404:
                return None
            raise Exception(f"Failed to get user from Google Workspace: {error}")

    def parse_user_data(self, google_user: Dict) -> Dict:
        """
        Parse Google Workspace user data into our application format

        Args:
            google_user: User dictionary from Google API

        Returns:
            Parsed user data dictionary
        """
        primary_email = google_user.get('primaryEmail', '')
        name_data = google_user.get('name', {})
        full_name = name_data.get('fullName', '')

        # Extract org unit path (can be used for department)
        org_unit = google_user.get('orgUnitPath', '/')
        department = org_unit.strip('/').split('/')[0] if org_unit != '/' else None

        # Extract custom fields if available
        custom_schemas = google_user.get('customSchemas', {})

        # Everyone syncs in as a normal user. Deriving the app role from Google's
        # admin flags handed this app's admin to anyone Google called an admin,
        # including delegated admins such as help-desk staff, and the sync only ever
        # promoted - so the grant outlived the Google one. Admins are assigned in the
        # app, like every other user.
        role = 'user'

        # Get profile photo
        photo_url = google_user.get('thumbnailPhotoUrl')

        # Check if user is suspended
        is_suspended = google_user.get('suspended', False)

        return {
            'email': primary_email,
            'name': full_name,
            'role': role,
            'department': department,
            'profile_photo': photo_url,
            'is_suspended': is_suspended,
            'google_id': google_user.get('id'),
            'org_unit_path': org_unit,
            'custom_schemas': custom_schemas,
        }

