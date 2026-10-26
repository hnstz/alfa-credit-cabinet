package ru.oldzoomer.alfacreditbackend.repository;

import org.springframework.data.repository.CrudRepository;
import org.springframework.stereotype.Repository;
import ru.oldzoomer.alfacreditbackend.entity.User;

import java.util.Optional;

@Repository
public interface UserRepository extends CrudRepository<User, String> {

    Optional<User> findByLogin(String login);
}
