"""
Serializer for the authenticated change-password flow.
Kept separate to avoid circular imports with the main serializers module.
"""
from rest_framework import serializers
from .serializers import validate_password_strength


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)
    refresh_token = serializers.CharField(write_only=True, required=False, allow_blank=True)

    def validate_new_password(self, value: str) -> str:
        return validate_password_strength(value)

    def validate(self, data: dict) -> dict:
        if data['new_password'] != data['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'New passwords do not match.'})
        if data['current_password'] == data['new_password']:
            raise serializers.ValidationError(
                {'new_password': 'New password must differ from the current password.'}
            )
        return data
